/**
 * Prompt audit log — one append-only row per admin write action against a
 * prompt / version / schedule / case. Admin-plane only. Never throws into the
 * caller's path: a failed audit write is logged but does not roll back the
 * action it was recording (the action already succeeded).
 */
import { db } from '@/lib/db';
import { promptAuditLog, type PromptAuditAction } from '@/lib/db/schema';

export async function logPromptAudit(entry: {
  actorUserId?: number | null;
  action: PromptAuditAction;
  promptId?: number | null;
  versionId?: number | null;
  detail?: unknown;
}): Promise<void> {
  try {
    await db.insert(promptAuditLog).values({
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      promptId: entry.promptId ?? null,
      versionId: entry.versionId ?? null,
      detail: (entry.detail ?? null) as unknown,
    });
  } catch (err) {
    console.error('[prompt-audit] failed to write audit entry:', err);
  }
}
