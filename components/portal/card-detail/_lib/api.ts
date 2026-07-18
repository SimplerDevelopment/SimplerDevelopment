/**
 * Thin fetch wrappers for the `/api/portal/cards/:id/...` endpoints used by
 * the card-detail modal. Keeps the call surface in one place so the dispatcher
 * + hook + section components don't repeat URL strings.
 *
 * Extracted from the pre-refactor inline fetches in CardDetailModal.tsx.
 */

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function jsonFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, init);
  return (await res.json()) as ApiEnvelope<T>;
}

/* ─── Loaders ──────────────────────────────────────────────────────────── */

export const fetchCardBundle = (cardId: number) =>
  jsonFetch(`/api/portal/cards/${cardId}`);

export const fetchMentionableUsers = () => jsonFetch('/api/portal/mentionable-users');

export const fetchProjectLabels = (projectId: number) =>
  jsonFetch(`/api/portal/projects/${projectId}/labels`);

export const fetchProjectCards = (projectId: number) =>
  jsonFetch(`/api/portal/projects/${projectId}/cards`);

export const fetchArtifacts = (cardId: number) =>
  jsonFetch(`/api/portal/cards/${cardId}/artifacts`);

export const fetchAvailableArtifacts = (cardId: number) =>
  jsonFetch(`/api/portal/cards/${cardId}/artifacts/available`);

/* ─── Mutations ────────────────────────────────────────────────────────── */

export const patchCardField = (cardId: number, field: string, value: unknown) =>
  jsonFetch(`/api/portal/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });

export const deleteCard = (cardId: number) =>
  fetch(`/api/portal/cards/${cardId}`, { method: 'DELETE' });

export const uploadCardFile = async (cardId: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/portal/cards/${cardId}/files`, {
    method: 'POST',
    body: fd,
  });
  return (await res.json()) as ApiEnvelope<unknown>;
};

export const deleteCardFile = (cardId: number, fileId: number) =>
  fetch(`/api/portal/cards/${cardId}/files/${fileId}`, { method: 'DELETE' });

export const postComment = (
  cardId: number,
  body: string,
  mentions: number[],
  fileIds: number[],
) =>
  jsonFetch(`/api/portal/cards/${cardId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, mentions, fileIds }),
  });

export const deleteComment = (cardId: number, commentId: number) =>
  fetch(`/api/portal/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' });

export const postTimeLog = (cardId: number, minutes: number, note: string | null) =>
  jsonFetch(`/api/portal/cards/${cardId}/time-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes, note }),
  });

export const deleteTimeLog = (cardId: number, logId: number) =>
  fetch(`/api/portal/cards/${cardId}/time-logs/${logId}`, { method: 'DELETE' });

export const attachLabel = (cardId: number, labelId: number) =>
  fetch(`/api/portal/cards/${cardId}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labelId }),
  });

export const detachLabel = (cardId: number, labelId: number) =>
  fetch(`/api/portal/cards/${cardId}/labels?labelId=${labelId}`, { method: 'DELETE' });

export const createProjectLabel = (projectId: number, name: string, color: string) =>
  jsonFetch(`/api/portal/projects/${projectId}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });

export const addChecklistItem = (cardId: number, text: string) =>
  jsonFetch(`/api/portal/cards/${cardId}/checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

export const patchChecklistItem = (itemId: number, completed: boolean) =>
  fetch(`/api/portal/checklist-items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });

export const deleteChecklistItem = (itemId: number) =>
  fetch(`/api/portal/checklist-items/${itemId}`, { method: 'DELETE' });

export const addAssigneeApi = (cardId: number, userId: number) =>
  fetch(`/api/portal/cards/${cardId}/assignees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

export const removeAssigneeApi = (cardId: number, userId: number) =>
  fetch(`/api/portal/cards/${cardId}/assignees?userId=${userId}`, { method: 'DELETE' });

export const watchCard = (cardId: number, watch: boolean) =>
  fetch(`/api/portal/cards/${cardId}/watch`, { method: watch ? 'POST' : 'DELETE' });

export const addBlockerApi = (cardId: number, blockerCardId: number) =>
  fetch(`/api/portal/cards/${cardId}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockerCardId }),
  });

export const removeBlockerApi = (cardId: number, blockerCardId: number) =>
  fetch(`/api/portal/cards/${cardId}/dependencies?blockerCardId=${blockerCardId}`, {
    method: 'DELETE',
  });

export const linkArtifact = (cardId: number, artifactType: string, artifactId: number) =>
  jsonFetch(`/api/portal/cards/${cardId}/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifactType, artifactId }),
  });

export const updateArtifact = (cardId: number, artifactDbId: number, pinned: boolean) =>
  fetch(`/api/portal/cards/${cardId}/artifacts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifactDbId, pinned }),
  });

export const unlinkArtifact = (cardId: number, artifactDbId: number) =>
  fetch(`/api/portal/cards/${cardId}/artifacts`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifactDbId }),
  });
