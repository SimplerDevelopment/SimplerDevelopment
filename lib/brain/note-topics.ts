// Topics per note, batched (PUX-159, design doc screen 18). Today topic
// membership is only readable topic → entities (listEntitiesForTopic); the
// Knowledge list needs the reverse for a page of notes in one query, and
// lib/brain/topics.ts is a pinned god file — so it lives here.
import { db } from '@/lib/db';
import { brainEntityTopics, brainTopics } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export interface NoteTopic { id: number; name: string }

export async function topicsForNotes(clientId: number, noteIds: number[]): Promise<Record<number, NoteTopic[]>> {
  if (noteIds.length === 0) return {};
  const rows = await db
    .select({ noteId: brainEntityTopics.entityId, id: brainTopics.id, name: brainTopics.name })
    .from(brainEntityTopics)
    .innerJoin(brainTopics, eq(brainTopics.id, brainEntityTopics.topicId))
    .where(and(eq(brainEntityTopics.clientId, clientId), eq(brainEntityTopics.entityType, 'note'), inArray(brainEntityTopics.entityId, noteIds)));
  const out: Record<number, NoteTopic[]> = {};
  for (const r of rows) (out[r.noteId] ??= []).push({ id: r.id, name: r.name });
  return out;
}
