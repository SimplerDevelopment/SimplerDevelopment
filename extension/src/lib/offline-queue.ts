// Durable offline queue for CRM/Brain captures. Before this, every capture was
// a single fire-and-forget fetch — an offline or failed POST was lost with only
// a toast. Now a failed capture is persisted to chrome.storage.local and
// replayed when connectivity returns, so nothing the user saved silently
// disappears.
//
// Contacts and companies are already de-duplicated server-side (by email /
// domain), so replay is safe. Notes and tasks are not yet idempotent server-
// side, so a replay *could* duplicate in the rare case a capture was queued
// offline AND the original request had actually reached the server before the
// connection dropped — an acceptable trade against silently losing the capture.
// (A server-side clientKey would make it exactly-once; tracked separately.)

import { api, ApiNetworkError } from './api';

const QUEUE_KEY = 'sd-brain-offline-queue';
const MAX_ATTEMPTS = 5;

export type QueuedCapture =
  | { id: string; kind: 'note'; input: Parameters<typeof api.createNote>[0]; createdAt: number; attempts: number }
  | { id: string; kind: 'contact'; input: Parameters<typeof api.createContact>[0]; createdAt: number; attempts: number }
  | { id: string; kind: 'company'; input: Parameters<typeof api.createCompany>[0]; createdAt: number; attempts: number }
  | { id: string; kind: 'task'; input: Parameters<typeof api.createTask>[0]; createdAt: number; attempts: number };

async function read(): Promise<QueuedCapture[]> {
  try {
    const out = await chrome.storage.local.get(QUEUE_KEY);
    const raw = out[QUEUE_KEY];
    return Array.isArray(raw) ? (raw as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}

async function write(items: QueuedCapture[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: items });
}

/** Persist a capture that couldn't be sent now, to replay on reconnect. */
export async function enqueue<K extends QueuedCapture['kind']>(
  kind: K,
  input: Extract<QueuedCapture, { kind: K }>['input'],
): Promise<void> {
  const items = await read();
  items.push({ id: crypto.randomUUID(), kind, input, createdAt: Date.now(), attempts: 0 } as QueuedCapture);
  await write(items);
}

export async function queueSize(): Promise<number> {
  return (await read()).length;
}

async function replay(item: QueuedCapture): Promise<void> {
  switch (item.kind) {
    case 'note':
      await api.createNote(item.input);
      return;
    case 'contact':
      await api.createContact(item.input);
      return;
    case 'company':
      await api.createCompany(item.input);
      return;
    case 'task':
      await api.createTask(item.input);
      return;
  }
}

let flushing = false;

/**
 * Replay queued captures oldest-first. Stops at the first network error (still
 * offline) and leaves that item and everything after it queued. An item the
 * server rejects for a non-network reason (auth/validation) is retried up to
 * MAX_ATTEMPTS then dropped, so one poisoned payload can't wedge the queue
 * forever. Re-entrancy-guarded. Returns the number successfully synced.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    const items = await read();
    if (items.length === 0) return 0;

    const remaining: QueuedCapture[] = [];
    let synced = 0;
    let offline = false;

    for (const item of items) {
      if (offline) {
        remaining.push(item);
        continue;
      }
      try {
        await replay(item);
        synced++;
      } catch (err) {
        if (err instanceof ApiNetworkError) {
          offline = true; // still offline — keep this and the rest, stop trying
          remaining.push(item);
        } else {
          const attempts = item.attempts + 1;
          if (attempts < MAX_ATTEMPTS) remaining.push({ ...item, attempts });
          // else: drop the poisoned payload
        }
      }
    }

    await write(remaining);
    return synced;
  } finally {
    flushing = false;
  }
}
