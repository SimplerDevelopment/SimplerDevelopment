/**
 * cov-u57 — Plugins Extension E2E Coverage
 *
 * Cards (indices 0–3 from the "## To Test" backlog):
 *   0. Plugin install / uninstall lifecycle
 *   1. Plugin sandboxing (tenant isolation)
 *   2. Extension marketplace browse + install
 *   3. Plugin with status=draft or status=disabled returns 404 at /portal/apps/<slug>
 *
 * Cards 0–2 have no implementation (gap). Card 3 has logic in
 * lib/plugins/entitlement.ts + app/portal/apps/[appId]/layout.tsx —
 * findActivePluginBySlug filters to status='active'; a draft/disabled slug
 * triggers notFound(). We seed the DB row via psql, verify, then clean up.
 */

import { execSync } from 'child_process';
import { test, expect } from './setup/fixtures';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://dancoyle@localhost:5432/simplerdev_test';

function psql(sql: string) {
  execSync(`psql "${DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`, {
    stdio: 'pipe',
  });
}

// ── Card 3: draft/disabled plugin → 404 at /portal/apps/<slug> ───────────────

test.describe('Plugin status=draft|disabled returns 404 @plugins', () => {
  const DRAFT_SLUG = `cov-u57-draft-${Date.now()}`;
  const DISABLED_SLUG = `cov-u57-disabled-${Date.now()}`;

  test.beforeAll(async () => {
    // Insert two test plugins — one draft, one disabled.
    // host_url and manifest_url can be placeholder values since no request
    // will ever reach the plugin host in these tests.
    psql(
      `INSERT INTO registered_apps (slug, name, host_url, manifest_url, status, visibility, allowed_client_ids, default_scopes)` +
        ` VALUES` +
        ` ('${DRAFT_SLUG}', 'COV U57 Draft Plugin', 'http://localhost:9999', 'http://localhost:9999/manifest.json', 'draft', 'global', '[]', '[]'),` +
        ` ('${DISABLED_SLUG}', 'COV U57 Disabled Plugin', 'http://localhost:9999', 'http://localhost:9999/manifest.json', 'disabled', 'global', '[]', '[]')`,
    );
  });

  test.afterAll(async () => {
    psql(
      `DELETE FROM registered_apps WHERE slug IN ('${DRAFT_SLUG}', '${DISABLED_SLUG}')`,
    );
  });

  test('draft plugin slug returns 404 for authenticated client @critical', async ({
    clientApi,
  }) => {
    const res = await clientApi.get(`/portal/apps/${DRAFT_SLUG}`);
    // Next.js notFound() renders the not-found.tsx and responds with HTTP 404.
    expect(res.status).toBe(404);
  });

  test('disabled plugin slug returns 404 for authenticated client', async ({
    clientApi,
  }) => {
    const res = await clientApi.get(`/portal/apps/${DISABLED_SLUG}`);
    expect(res.status).toBe(404);
  });

  test('non-existent slug also returns 404 (sanity check for null path)', async ({
    clientApi,
  }) => {
    const res = await clientApi.get(`/portal/apps/slug-that-does-not-exist-${Date.now()}`);
    expect(res.status).toBe(404);
  });
});
