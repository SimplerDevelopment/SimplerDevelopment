import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainNotes, kanbanCardFiles, projects, users, privateMediaKeys } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { getPortalRole } from '@/lib/portal-client';
import { hasScope, resolvePortalFromRequest } from '@/lib/mcp-auth';
import { attachmentObjectKey } from './private-media-registry';

export function isValidMediaKey(key: string): boolean {
  return /^(media\/|private\/[1-9]\d*\/)/.test(key)
    && key.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !part.includes('\\'));
}

async function loadMediaReferences(key: string) {
  const legacyName = key.startsWith('media/') ? key.slice(6) : key;
  const notes = await db.select({ clientId: brainNotes.clientId, deletedAt: brainNotes.deletedAt })
    .from(brainNotes).where(or(
      eq(brainNotes.attachmentStoredKey, legacyName), eq(brainNotes.attachmentStoredKey, key),
      eq(brainNotes.attachmentUrl, `/api/media/proxy/${key}`),
    ));
  const cards = await db.select({ clientId: projects.clientId }).from(kanbanCardFiles)
    .innerJoin(projects, eq(projects.id, kanbanCardFiles.projectId)).where(or(
      eq(kanbanCardFiles.storedFilename, legacyName), eq(kanbanCardFiles.storedFilename, key),
      eq(kanbanCardFiles.url, `/api/media/proxy/${key}`),
    ));
  return { notes, cards };
}

async function resolveMediaActor(req: Request) {
  const bearer = await resolvePortalFromRequest(req);
  const session = bearer ? null : await auth();
  const userId = bearer?.userId ?? Number(session?.user?.id);
  if (!userId) return null;
  const [user] = await db.select({ active: users.active, role: users.role }).from(users)
    .where(eq(users.id, userId)).limit(1);
  if (!user?.active) return null;
  return { bearer, userId, user };
}

type MediaActor = NonNullable<Awaited<ReturnType<typeof resolveMediaActor>>>;
type MediaReferences = Awaited<ReturnType<typeof loadMediaReferences>>;

function hasMediaResourceScopes(actor: MediaActor, references: MediaReferences): boolean {
  const { bearer } = actor;
  if (!bearer) return true;
  if (references.notes.length > 0 && !hasScope(bearer.scopes, 'brain:read')) return false;
  if (references.cards.length > 0 && !hasScope(bearer.scopes, 'projects:read')) return false;
  return true;
}

async function canReadClientMedia(actor: MediaActor, clientId: number): Promise<boolean> {
  if (actor.bearer && !actor.bearer.allowedClientIds?.includes(clientId)) return false;
  if (!actor.bearer && ['admin', 'employee'].includes(actor.user.role)) return true;
  return Boolean(await getPortalRole(actor.userId, clientId));
}

/** Look up legacy references before public caching; old URLs keep their policy. */
export async function authorizeMediaDownload(req: Request, key: string): Promise<'public' | 'private' | 'denied'> {
  key = attachmentObjectKey(key);
  const [marker] = await db.select({ clientId: privateMediaKeys.clientId }).from(privateMediaKeys)
    .where(eq(privateMediaKeys.key, key)).limit(1);
  if (marker && marker.clientId === null) return 'denied';
  const references = await loadMediaReferences(key);
  const { notes, cards } = references;
  if (notes.length === 0 && cards.length === 0) return marker || key.startsWith('private/') ? 'denied' : 'public';
  if (notes.some((note) => note.deletedAt)) return 'denied';
  const actor = await resolveMediaActor(req);
  if (!actor || !hasMediaResourceScopes(actor, references)) return 'denied';
  const clientIds = new Set([...notes, ...cards].map((row) => row.clientId));
  if (marker?.clientId) clientIds.add(marker.clientId);
  for (const clientId of clientIds) {
    if (!(await canReadClientMedia(actor, clientId))) return 'denied';
  }
  return 'private';
}
