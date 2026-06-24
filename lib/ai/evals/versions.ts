/**
 * Active-version transitions for the prompt registry (promote / rollback).
 *
 * Making a version active is the one high-blast-radius write: production
 * `resolvePrompt` serves whatever `promptRegistry.activeVersionId` points at.
 * The swap (archive the outgoing active, activate the target, move the pointer)
 * must be atomic, and the in-process prompt cache must be cleared so the change
 * propagates within the cache TTL.
 */
import { db } from '@/lib/db';
import { promptRegistry, promptVersions, evalRuns } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { clearPromptCache } from '@/lib/ai/prompt-registry';

export interface SetActiveResult {
  ok: boolean;
  error?: string;
  previousVersionId: number | null;
}

/**
 * Atomically make `versionId` the active version of `promptId`: archive the
 * previously-active version (if different), mark the target active, and move
 * the registry pointer. Validates the version belongs to the prompt. Clears the
 * prompt cache on success.
 */
export async function setActiveVersion(promptId: number, versionId: number): Promise<SetActiveResult> {
  const [version] = await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, promptId)))
    .limit(1);
  if (!version) return { ok: false, error: 'Version not found for this prompt', previousVersionId: null };

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return { ok: false, error: 'Prompt not found', previousVersionId: null };

  const previousVersionId = prompt.activeVersionId;

  await db.transaction(async (tx) => {
    if (previousVersionId && previousVersionId !== versionId) {
      await tx
        .update(promptVersions)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(promptVersions.id, previousVersionId));
    }
    await tx
      .update(promptVersions)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(promptVersions.id, versionId));
    await tx
      .update(promptRegistry)
      .set({ activeVersionId: versionId, updatedAt: new Date() })
      .where(eq(promptRegistry.id, promptId));
  });

  // Production resolvePrompt caches the active body for 60s — drop it so the
  // promote/rollback takes effect within the TTL rather than after it.
  clearPromptCache();

  return { ok: true, previousVersionId };
}

/** Latest completed-run pass rate for a version, or null if it has never run. */
export async function latestDonePassRate(promptVersionId: number): Promise<number | null> {
  const [row] = await db
    .select({ passRate: evalRuns.passRate })
    .from(evalRuns)
    .where(and(eq(evalRuns.promptVersionId, promptVersionId), eq(evalRuns.status, 'done')))
    .orderBy(desc(evalRuns.createdAt))
    .limit(1);
  return row?.passRate ?? null;
}
