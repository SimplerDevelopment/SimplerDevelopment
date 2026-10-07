import { db } from '@/lib/db';
import { privateMediaKeys } from '@/lib/db/schema';

/** Upload rows historically stored the filename alone; new private keys are full paths. */
export function attachmentObjectKey(storedKey: string): string {
  return storedKey.startsWith('private/') || storedKey.startsWith('media/')
    ? storedKey : `media/${storedKey}`;
}

/** Durable marker survives row deletion and failed S3 cleanup. Never remove it. */
export async function rememberPrivateAttachment(storedKey: string, clientId: number): Promise<void> {
  await db.insert(privateMediaKeys).values({ key: attachmentObjectKey(storedKey), clientId }).onConflictDoNothing();
}

async function rememberPrivateAttachments(storedKeys: string[], clientId: number): Promise<void> {
  const rows = [...new Set(storedKeys)].map((key) => ({ key: attachmentObjectKey(key), clientId }));
  if (rows.length) await db.insert(privateMediaKeys).values(rows).onConflictDoNothing();
}

/** Preserve markers before removing note references, returning keys for S3 cleanup. */
export async function rememberNoteAttachments(
  notes: Array<{ id: number; attachmentStoredKey: string | null }>,
  clientId: number,
  allowedIds?: number[],
): Promise<string[]> {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const keys = notes.filter((note) => !allowed || allowed.has(note.id))
    .map((note) => note.attachmentStoredKey)
    .filter((key): key is string => typeof key === 'string' && key.length > 0);
  await rememberPrivateAttachments(keys, clientId);
  return keys;
}
