/**
 * cov-u11.spec.ts — Sites Hosting Publishing: Environment env-var CRUD,
 * backup create, restore, and Vercel sync (indices 4–7 of the To Test backlog).
 *
 * These routes live under:
 *   /api/portal/websites/[siteId]/environments/[envId]/vars    (GET, POST)
 *   /api/portal/websites/[siteId]/environments/[envId]/backup  (GET, POST)
 *   /api/portal/websites/[siteId]/environments/[envId]/restore (POST)
 *   /api/portal/websites/[siteId]/environments/[envId]/sync    (POST)
 *
 * Environments have no public POST endpoint — they are provisioner-created.
 * We seed one via psql in beforeAll and tear it down in afterAll.
 */
import { execSync } from 'child_process';
import { test, expect } from './setup/fixtures';

// ── DB seed helpers ──────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/simplerdev_test';

function psql(sql: string): string {
  return execSync(`psql "${DB_URL}" -t -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim();
}

// The seed client_websites row that belongs to client_id=1 (client@example.com).
const SITE_ID = 1;

let ENV_ID: number;
let VAR_ID: number;

test.beforeAll(async () => {
  // Insert a fresh environment for this spec run
  const row = psql(
    `INSERT INTO website_environments (website_id, name, vercel_target)
     VALUES (${SITE_ID}, 'cov-u11-test-env', 'preview')
     RETURNING id;`
  );
  ENV_ID = parseInt(row.trim(), 10);
  if (!ENV_ID) throw new Error(`Failed to seed environment. psql output: "${row}"`);
});

test.afterAll(async () => {
  // CASCADE deletes env vars and backups
  psql(`DELETE FROM website_environments WHERE id = ${ENV_ID};`);
});

// ── Card 4: Environment env-var CRUD ────────────────────────────────────────

test.describe('Env-var CRUD @sites @env-vars', () => {
  test.afterEach(async () => {
    if (VAR_ID) {
      psql(`DELETE FROM website_env_vars WHERE id = ${VAR_ID};`);
      VAR_ID = 0;
    }
  });

  test('POST /vars creates an env var @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { key: `TEST_KEY_${ts}`, value: 'hello-world' }
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.key).toBe(`TEST_KEY_${ts}`);
    VAR_ID = res.data.data.id;
  });

  test('GET /vars lists the created var', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { key: `LIST_KEY_${ts}`, value: 'list-val' }
    );
    expect(create.status).toBe(200);
    VAR_ID = create.data.data.id;

    const res = await clientApi.get(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    const found = res.data.data.find((v: { id: number }) => v.id === VAR_ID);
    expect(found).toBeTruthy();
    expect(found.value).toBe('list-val');
  });

  test('DELETE /vars/[varId] removes the var', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { key: `DEL_KEY_${ts}`, value: 'delete-me' }
    );
    expect(create.status).toBe(200);
    const varId = create.data.data.id;
    // VAR_ID = 0 so afterEach doesn't double-delete
    VAR_ID = 0;

    const del = await clientApi.delete(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars/${varId}`
    );
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // Confirm it's gone from the list
    const list = await clientApi.get(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`
    );
    const stillThere = list.data.data?.find((v: { id: number }) => v.id === varId);
    expect(stillThere).toBeUndefined();
  });

  test('POST /vars rejects missing key', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { value: 'no-key-here' }
    );
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated GET', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`
    );
    expect(res.status).toBe(401);
  });
});

// ── Card 5: Environment backup create ────────────────────────────────────────

test.describe('Environment backup create @sites @env-backup', () => {
  test('POST /backup creates a backup and GET lists it @critical', async ({ clientApi }) => {
    const ts = Date.now();
    // Seed a var so the snapshot has content
    const varRes = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { key: `BACKUP_KEY_${ts}`, value: 'backup-val' }
    );
    expect(varRes.status).toBe(200);
    const seededVarId = varRes.data.data.id;

    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/backup`,
      { name: `Test Backup ${ts}` }
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toBe(`Test Backup ${ts}`);
    const backupId = res.data.data.id;

    // GET /backup should list it
    const list = await clientApi.get(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/backup`
    );
    expect(list.status).toBe(200);
    expect(list.data.success).toBe(true);
    expect(Array.isArray(list.data.data)).toBe(true);
    const found = list.data.data.find((b: { id: number }) => b.id === backupId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(`Test Backup ${ts}`);

    // Cleanup
    psql(`DELETE FROM website_env_vars WHERE id = ${seededVarId};`);
    psql(`DELETE FROM website_backups WHERE id = ${backupId};`);
  });

  test('POST /backup with no name uses a default name', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/backup`,
      {}
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.name).toBe('string');
    expect(res.data.data.name.length).toBeGreaterThan(0);

    // Cleanup
    psql(`DELETE FROM website_backups WHERE id = ${res.data.data.id};`);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/backup`,
      {}
    );
    expect(res.status).toBe(401);
  });
});

// ── Card 6: Environment restore ───────────────────────────────────────────────

test.describe('Environment restore @sites @env-restore', () => {
  test('POST /restore replaces env vars from backup snapshot @critical', async ({ clientApi }) => {
    const ts = Date.now();

    // 1. Seed a var and create a backup
    const varRes = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`,
      { key: `RESTORE_KEY_${ts}`, value: 'original' }
    );
    expect(varRes.status).toBe(200);

    const backupRes = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/backup`,
      { name: `Restore Backup ${ts}` }
    );
    expect(backupRes.status).toBe(200);
    const backupId = backupRes.data.data.id;

    // 2. Clear the var and add a new one (to show restore replaces state)
    psql(`DELETE FROM website_env_vars WHERE environment_id = ${ENV_ID};`);
    psql(
      `INSERT INTO website_env_vars (environment_id, key, value)
       VALUES (${ENV_ID}, 'NEW_KEY_${ts}', 'new-val');`
    );

    // 3. Restore
    const restore = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/restore`,
      { backupId }
    );
    expect(restore.status).toBe(200);
    expect(restore.data.success).toBe(true);
    expect(restore.data.message).toMatch(/restored/i);

    // 4. Verify env vars were replaced back to the backup state
    const list = await clientApi.get(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/vars`
    );
    expect(list.status).toBe(200);
    const keys = (list.data.data as Array<{ key: string }>).map(v => v.key);
    expect(keys).toContain(`RESTORE_KEY_${ts}`);
    expect(keys).not.toContain(`NEW_KEY_${ts}`);

    // Cleanup (env vars are wiped by restore; just clean backups)
    psql(`DELETE FROM website_backups WHERE environment_id = ${ENV_ID};`);
    psql(`DELETE FROM website_env_vars WHERE environment_id = ${ENV_ID};`);
  });

  test('POST /restore returns 400 when backupId is missing', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/restore`,
      {}
    );
    expect(res.status).toBe(400);
  });

  test('POST /restore returns 404 for unknown backupId', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/restore`,
      { backupId: 999999 }
    );
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/restore`,
      { backupId: 1 }
    );
    expect(res.status).toBe(401);
  });
});

// ── Card 7: Environment sync to Vercel ───────────────────────────────────────

test.describe('Environment sync to Vercel @sites @env-sync', () => {
  test('POST /sync returns 400 (not provisioned) for unprovisioned site @critical', async ({ clientApi }) => {
    // Site 1 has no vercel_project_id — expect 400 "must be provisioned first"
    const res = await clientApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/sync`,
      {}
    );
    // Route checks vercelProjectId and returns 400 if missing
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/provisioned/i);
  });

  test('POST /sync with no vars returns success when site has vercelProjectId', async ({ clientApi }) => {
    // Create a temp site with a fake vercelProjectId to test zero-var path
    const ts = Date.now();
    const createSite = await clientApi.post('/api/portal/cms/websites', {
      name: `Sync Test Site ${ts}`,
      domain: `sync-test-${ts}.example.com`,
      description: 'sync test',
    });
    if (!createSite.data?.success) {
      test.skip(true, 'Cannot create website via API — skip sync no-vars path');
      return;
    }
    const tempSiteId = createSite.data.data.id as number;

    // Insert env and set vercelProjectId via psql
    const envRow = psql(
      `INSERT INTO website_environments (website_id, name, vercel_target)
       VALUES (${tempSiteId}, 'sync-env', 'production')
       RETURNING id;`
    );
    const tempEnvId = parseInt(envRow.trim(), 10);
    psql(`UPDATE client_websites SET vercel_project_id = 'fake-prj-${ts}' WHERE id = ${tempSiteId};`);

    try {
      // No vars → should return success with "No env vars to sync."
      const res = await clientApi.post(
        `/api/portal/websites/${tempSiteId}/environments/${tempEnvId}/sync`,
        {}
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.message).toMatch(/no env vars/i);
    } finally {
      psql(`DELETE FROM website_environments WHERE id = ${tempEnvId};`);
      psql(`UPDATE client_websites SET vercel_project_id = NULL WHERE id = ${tempSiteId};`);
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/${SITE_ID}/environments/${ENV_ID}/sync`,
      {}
    );
    expect(res.status).toBe(401);
  });
});
