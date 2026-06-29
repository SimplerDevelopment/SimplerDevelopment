// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredScopeFor } from '@/lib/ai/portal-tools/scopes';

/**
 * Regression guard for distill finding #2: the automation engine's scope gate
 * (`isActionAllowed` in lib/automation/engine.ts) passes through any tool whose
 * `requiredScopeFor` is null ("don't block unknown tools"). That's correct for
 * portal tools (executePortalTool re-scopes them), but the engine ALSO has
 * inline special-case bridges — `action.tool === 'fire_webhook' | 'start_playbook'
 * | 'run_plugin_script'` — that execute WITHOUT going through executePortalTool.
 * If a new such bridge is added without a matching AUTOMATION_ACTION_SCOPES
 * entry, requiredScopeFor returns null and a ZERO-SCOPE rule could fire it.
 * This has been reintroduced historically (commit 22084e61).
 *
 * Source-scan, DB-free: extracts every inline `action.tool === '...'` branch and
 * asserts each is scope-mapped, so adding a new ungated bridge fails on commit.
 */
const ENGINE = resolve(__dirname, '..', '..', 'lib', 'automation', 'engine.ts');

describe('automation engine: inline action bridges are scope-mapped', () => {
  it('every `action.tool === "..."` bridge has a required scope', () => {
    const src = readFileSync(ENGINE, 'utf8');
    const tools = [...new Set([...src.matchAll(/action\.tool === '([a-z_]+)'/g)].map((m) => m[1]))];
    expect(tools.length, 'sanity: the engine should have inline action bridges').toBeGreaterThan(0);

    const ungated = tools.filter((t) => requiredScopeFor(t) === null);
    expect(
      ungated,
      `inline automation bridges with NO required scope — a zero-scope rule could fire these. ` +
        `Add each to AUTOMATION_ACTION_SCOPES in lib/ai/portal-tools/scopes.ts: ${ungated.join(', ')}`,
    ).toEqual([]);
  });
});
