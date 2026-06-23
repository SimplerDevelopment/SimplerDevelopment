import { db } from '@/lib/db'
import { brainProfiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { AgentPreferences } from '@/lib/db/schema'

/**
 * Load preferences for this client's brain profile.
 * Returns defaults if no profile exists yet.
 */
export async function getAgentPreferences(clientId: number): Promise<AgentPreferences> {
  const [profile] = await db
    .select({ agentPreferences: brainProfiles.agentPreferences })
    .from(brainProfiles)
    .where(eq(brainProfiles.clientId, clientId))
    .limit(1)

  return profile?.agentPreferences ?? {}
}

/**
 * Merge new preference values into the stored preferences.
 * Non-provided keys are preserved. Uses an upsert via brainProfiles.
 */
export async function updateAgentPreferences(
  clientId: number,
  patch: Partial<AgentPreferences>,
): Promise<AgentPreferences> {
  const existing = await getAgentPreferences(clientId)
  const merged: AgentPreferences = { ...existing, ...patch }

  const [row] = await db
    .insert(brainProfiles)
    .values({
      clientId,
      name: '',
      agentPreferences: merged,
    })
    .onConflictDoUpdate({
      target: brainProfiles.clientId,
      set: { agentPreferences: merged, updatedAt: new Date() },
    })
    .returning({ agentPreferences: brainProfiles.agentPreferences })

  return row?.agentPreferences ?? merged
}

/**
 * Auto-track which intent area the user just asked about.
 * Increments that area in frequentAreas (capped at 10 entries, most recent first).
 */
export async function trackIntentUsage(
  clientId: number,
  intent: string,
): Promise<void> {
  const existing = await getAgentPreferences(clientId)
  const areas = existing.frequentAreas ?? []
  // Prepend new intent, deduplicate (keep first occurrence = most recent), cap at 10
  const deduped = [intent, ...areas.filter((a) => a !== intent)].slice(0, 10)
  await updateAgentPreferences(clientId, { frequentAreas: deduped })
}
