/**
 * Derive the union of required portal-tool scopes from an automation rule's
 * action list.  Used at create/update time to keep `automationRules.scopes`
 * in sync so the scope gate never blocks a legitimately-created rule.
 *
 * Skips actions whose tool name is unknown to the registry (e.g. the
 * 'start_playbook' sentinel) — those have no portal-tool scope.
 */
import type { AutomationAction } from '@/lib/db/schema';
import { requiredScopeFor } from './scopes';

/**
 * Returns a deduped, sorted array of scope strings required by the given
 * action list.  Returns [] for an empty action list.
 */
export function deriveRuleScopes(actions: AutomationAction[]): string[] {
  const seen = new Set<string>();
  for (const action of actions) {
    const scope = requiredScopeFor(action.tool);
    if (scope) seen.add(scope);
  }
  return Array.from(seen).sort();
}
