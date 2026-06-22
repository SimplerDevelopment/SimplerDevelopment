/**
 * Pitch-deck viewer analytics @gap @deck-analytics
 *
 * Public presenter posts view events; the portal analytics endpoint aggregates
 * total events, unique sessions, and per-slide views + avg time-on-slide.
 */
import { test, expect } from './setup/fixtures';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Pitch-deck viewer analytics @gap @deck-analytics', () => {
  let deckId: number;
  let slug: string;
  let otherUserId: number;
  let otherClientId: number;
  let otherDeckId: number;

  test.afterAll(async () => {
    if (deckId) sql(`DELETE FROM pitch_decks WHERE id=${deckId}`); // cascades views
    sql(`DELETE FROM pitch_decks WHERE id=${otherDeckId}`);
    sql(`DELETE FROM clients WHERE id=${otherClientId}`);
    sql(`DELETE FROM users WHERE id=${otherUserId}`);
  });

  test('public presenter records view events on a published deck', async ({ clientApi, request }) => {
    const create = await clientApi.post('/api/portal/tools/pitch-decks', { title: `Analytics Deck ${Date.now()}` });
    expect([200, 201]).toContain(create.status);
    deckId = create.data.data.id;
    slug = create.data.data.slug;
    sql(`UPDATE pitch_decks SET status='published' WHERE id=${deckId}`);

    for (const ev of [
      { sessionId: 's1', slideIndex: 0, dwellMs: 1000 },
      { sessionId: 's1', slideIndex: 1, dwellMs: 2000 },
      { sessionId: 's2', slideIndex: 0, dwellMs: 3000 },
    ]) {
      const res = await request.post(`/api/public/pitch-decks/${slug}/view`, { data: ev });
      expect(res.status()).toBe(200);
    }
    expect(parseInt(sql(`SELECT count(*) FROM pitch_deck_views WHERE deck_id=${deckId}`), 10)).toBe(3);

    // throwaway tenant + deck for cross-tenant analytics check
    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    otherUserId = parseInt(sql(`INSERT INTO users (name, email, password) VALUES ('O','da-${tag}@example.com','x') RETURNING id`), 10);
    otherClientId = parseInt(sql(`INSERT INTO clients (user_id, company) VALUES (${otherUserId},'O') RETURNING id`), 10);
    otherDeckId = parseInt(sql(`INSERT INTO pitch_decks (client_id, title, slug, status) VALUES (${otherClientId},'X','x-${tag}','published') RETURNING id`), 10);
  });

  test('portal analytics aggregates events + sessions + per-slide', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/tools/pitch-decks/${deckId}/analytics`);
    expect(res.status).toBe(200);
    expect(res.data.data.totalEvents).toBe(3);
    expect(res.data.data.uniqueSessions).toBe(2);
    const slide0 = (res.data.data.perSlide as Array<{ slideIndex: number; views: number; avgDwellMs: number }>)
      .find((s) => s.slideIndex === 0);
    expect(slide0?.views).toBe(2);
    expect(slide0?.avgDwellMs).toBe(2000); // (1000 + 3000) / 2
  });

  test('public view on an unknown/unpublished slug → 404', async ({ request }) => {
    expect((await request.post(`/api/public/pitch-decks/definitely-not-a-deck-xyz/view`, { data: {} })).status()).toBe(404);
  });

  test('analytics 404 unknown + cross-tenant; 401 unauthenticated', async ({ clientApi, unauthApi }) => {
    expect((await clientApi.get('/api/portal/tools/pitch-decks/999999/analytics')).status).toBe(404);
    expect((await clientApi.get(`/api/portal/tools/pitch-decks/${otherDeckId}/analytics`)).status).toBe(404);
    expect((await unauthApi.get(`/api/portal/tools/pitch-decks/${deckId}/analytics`)).status).toBe(401);
  });
});
