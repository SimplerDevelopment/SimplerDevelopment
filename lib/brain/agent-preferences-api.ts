import type { AgentPreferences } from '@/lib/db/schema'

/**
 * Formats user preferences as a string to append to the brain agent's system prompt.
 * Returns empty string if no meaningful preferences are set.
 */
export function formatPreferencesForPrompt(prefs: AgentPreferences): string {
  const lines: string[] = []
  if (prefs.preferredFormat) lines.push(`Format preference: ${prefs.preferredFormat === 'bullets' ? 'use bullet lists' : 'use flowing prose'}`)
  if (prefs.responseLength) lines.push(`Response length: ${prefs.responseLength === 'brief' ? 'be concise' : 'be thorough'}`)
  if (prefs.frequentAreas?.length) lines.push(`User frequently asks about: ${prefs.frequentAreas.slice(0, 3).join(', ')}`)
  if (!lines.length) return ''
  return `\n\n## User preferences\n${lines.join('\n')}`
}
