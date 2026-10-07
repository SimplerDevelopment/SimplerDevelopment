/** Run after the registry migration and before serving the hardened proxy. DB-only, idempotent. */
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { brainNotes, kanbanCardFiles, projects, privateMediaKeys } from '../lib/db/schema';
import { attachmentObjectKey } from '../lib/security/private-media-registry';

export async function backfillPrivateMediaKeys(): Promise<number> {
  const notes = await db.select({ key: brainNotes.attachmentStoredKey, clientId: brainNotes.clientId }).from(brainNotes);
  const cards = await db.select({ key: kanbanCardFiles.storedFilename, clientId: projects.clientId }).from(kanbanCardFiles)
    .innerJoin(projects, eq(projects.id, kanbanCardFiles.projectId));
  const owners = new Map<string, number | null>();
  for (const row of [...notes, ...cards]) {
    if (!row.key) continue;
    const key = attachmentObjectKey(row.key);
    owners.set(key, owners.has(key) && owners.get(key) !== row.clientId ? null : row.clientId);
  }
  const rows = [...owners].map(([key, clientId]) => ({ key, clientId }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    await db.insert(privateMediaKeys).values(rows.slice(offset, offset + 500)).onConflictDoNothing();
  }
  return rows.length;
}

if (import.meta.main) {
  backfillPrivateMediaKeys().then((count) => {
    console.log(`Private attachment keys registered: ${count}`);
    process.exit(0);
  }).catch((error) => { console.error(error); process.exit(1); });
}
