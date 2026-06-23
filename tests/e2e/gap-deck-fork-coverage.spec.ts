/**
 * Pitch-deck fork portal route @gap @deck-fork
 *
 * POST /api/portal/tools/pitch-decks/[id]/fork — portal-REST mirror of the
 * decks_fork MCP tool: independent draft copy with parentDeckId set; parent
 * untouched. Tenant-scoped.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Deck fork @gap @deck-fork', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let sourceId: number;
  let otherUserId: number;
  let otherClientId: number;
  let otherDeckId: number;

  test.afterAll(async () => {
    if (sourceId) sql(`DELETE FROM pitch_decks WHERE id=${sourceId} OR parent_deck_id=${sourceId}`);
    sql(`DELETE FROM pitch_decks WHERE id=${otherDeckId}`);
    sql(`DELETE FROM clients WHERE id=${otherClientId}`);
    sql(`DELETE FROM users WHERE id=${otherUserId}`);
    await runCleanups(cleanups);
  });

  test('fork creates an independent draft tied to the parent', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/tools/pitch-decks', { title: `Fork Source ${Date.now()}` });
    expect([200, 201]).toContain(create.status);
    sourceId = create.data.data.id;

    const res = await clientApi.post(`/api/portal/tools/pitch-decks/${sourceId}/fork`, {});
    expect(res.status).toBe(201);
    expect(res.data.data.id).not.toBe(sourceId);
    expect(res.data.data.parentDeckId).toBe(sourceId);
    expect(res.data.data.status).toBe('draft');
    expect(res.data.data.slug).not.toBe(create.data.data.slug);
    // Parent is untouched (still its original status).
    expect(sql(`SELECT status FROM pitch_decks WHERE id=${sourceId}`)).toBe(create.data.data.status);

    // throwaway tenant + deck for the cross-tenant check
    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    otherUserId = parseInt(sql(`INSERT INTO users (name, email, password) VALUES ('O','deck-${tag}@example.com','x') RETURNING id`), 10);
    otherClientId = parseInt(sql(`INSERT INTO clients (user_id, company) VALUES (${otherUserId},'O') RETURNING id`), 10);
    otherDeckId = parseInt(sql(`INSERT INTO pitch_decks (client_id, title, slug, status) VALUES (${otherClientId},'X','x-${tag}','draft') RETURNING id`), 10);
  });

  test('404 unknown deck + cross-tenant; 401 unauthenticated', async ({ clientApi, unauthApi }) => {
    expect((await clientApi.post('/api/portal/tools/pitch-decks/999999/fork', {})).status).toBe(404);
    expect((await clientApi.post(`/api/portal/tools/pitch-decks/${otherDeckId}/fork`, {})).status).toBe(404);
    // no fork was created from the other tenant's deck
    expect(sql(`SELECT count(*) FROM pitch_decks WHERE parent_deck_id=${otherDeckId}`)).toBe('0');
    expect((await unauthApi.post(`/api/portal/tools/pitch-decks/${sourceId}/fork`, {})).status).toBe(401);
  });
});
