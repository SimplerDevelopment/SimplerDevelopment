/**
 * Integration coverage for the deterministic GSC report derivations
 * (SEO-012, lib/seo/gsc-reports.ts). Every report anchors on max(date) for
 * the project, so each test picks a fixed anchor ('2026-03-15') and inserts
 * rows at hand-computed offsets from it rather than relying on wall-clock
 * dates — the math is checked by hand in the comments beside each fixture.
 *
 * `days=4` windows are used throughout (current = 03-12..03-15, previous =
 * 03-08..03-11) so fixtures stay small; getSearchOverview gets its own
 * `days=3` window per test since it aggregates ALL queries in range.
 */
import { describe, it, expect } from 'vitest';
import {
  getSearchOverview,
  getWinnersLosers,
  getNewLostQueries,
  getCtrOpportunities,
  getStrikingDistance,
  getPageDecay,
} from '@/lib/seo/gsc-reports';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function seedProject(clientId: number, domain: string): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.seo_projects (client_id, name, domain, start_url)
    VALUES (${clientId}, 'GSC Reports Test', ${domain}, ${`https://${domain}/`})
    RETURNING id
  `;
  return row.id;
}

type QueryRow = { projectId: number; clientId: number; date: string; query: string; clicks: number; impressions: number; position: number };
type PageRow = { projectId: number; clientId: number; date: string; page: string; clicks: number; impressions: number; position: number };

async function insertQueryDaily(rows: QueryRow[]): Promise<void> {
  const sql = getTestSql();
  for (const r of rows) {
    const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.seo_gsc_query_daily (project_id, client_id, date, query, clicks, impressions, ctr, position)
      VALUES (${r.projectId}, ${r.clientId}, ${r.date}, ${r.query}, ${r.clicks}, ${r.impressions}, ${ctr}, ${r.position})
    `;
  }
}

async function insertPageDaily(rows: PageRow[]): Promise<void> {
  const sql = getTestSql();
  for (const r of rows) {
    const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.seo_gsc_page_daily (project_id, client_id, date, page, clicks, impressions, ctr, position)
      VALUES (${r.projectId}, ${r.clientId}, ${r.date}, ${r.page}, ${r.clicks}, ${r.impressions}, ${ctr}, ${r.position})
    `;
  }
}

describe('GSC report derivations @seo', () => {
  it('computes overview totals + an ascending daily series', async () => {
    const { client } = await sessionForNewClientUser('overview');
    const projectId = await seedProject(client.id, 'overview.example.com');
    await insertQueryDaily([
      { projectId, clientId: client.id, date: '2026-03-13', query: 'q1', clicks: 10, impressions: 100, position: 5 },
      { projectId, clientId: client.id, date: '2026-03-14', query: 'q1', clicks: 20, impressions: 200, position: 6 },
      { projectId, clientId: client.id, date: '2026-03-15', query: 'q1', clicks: 30, impressions: 300, position: 7 },
    ]);

    const overview = await getSearchOverview(projectId, 3);
    expect(overview.series).toEqual([
      { date: '2026-03-13', clicks: 10, impressions: 100 },
      { date: '2026-03-14', clicks: 20, impressions: 200 },
      { date: '2026-03-15', clicks: 30, impressions: 300 },
    ]);
    expect(overview.totals.clicks).toBe(60);
    expect(overview.totals.impressions).toBe(600);
    // avgCtr = 60/600; avgPosition = (5*100 + 6*200 + 7*300) / 600 = 3800/600
    expect(overview.totals.avgCtr).toBeCloseTo(0.1, 10);
    expect(overview.totals.avgPosition).toBeCloseTo(3800 / 600, 4);
  });

  it('identifies a winner and a loser between the current and previous window', async () => {
    const { client } = await sessionForNewClientUser('winlose');
    const projectId = await seedProject(client.id, 'winlose.example.com');
    await insertQueryDaily([
      // current window (days=4, anchor=2026-03-15): 2026-03-12..2026-03-15
      { projectId, clientId: client.id, date: '2026-03-15', query: 'winner-q', clicks: 50, impressions: 500, position: 3 },
      { projectId, clientId: client.id, date: '2026-03-13', query: 'loser-q', clicks: 5, impressions: 100, position: 9 },
      // previous window: 2026-03-08..2026-03-11
      { projectId, clientId: client.id, date: '2026-03-10', query: 'winner-q', clicks: 10, impressions: 200, position: 8 },
      { projectId, clientId: client.id, date: '2026-03-09', query: 'loser-q', clicks: 40, impressions: 400, position: 4 },
    ]);

    const { winners, losers } = await getWinnersLosers(projectId, 4);
    expect(winners[0]).toMatchObject({ query: 'winner-q', clicks: 50, prevClicks: 10, deltaClicks: 40 });
    expect(losers[0]).toMatchObject({ query: 'loser-q', clicks: 5, prevClicks: 40, deltaClicks: -35 });
  });

  it('identifies a new query and a lost query', async () => {
    const { client } = await sessionForNewClientUser('newlost');
    const projectId = await seedProject(client.id, 'newlost.example.com');
    await insertQueryDaily([
      // current window only — never appeared before.
      { projectId, clientId: client.id, date: '2026-03-14', query: 'new-q', clicks: 8, impressions: 80, position: 6 },
      // previous window only — gone in the current window.
      { projectId, clientId: client.id, date: '2026-03-09', query: 'lost-q', clicks: 12, impressions: 150, position: 5.5 },
    ]);

    const { newQueries, lostQueries } = await getNewLostQueries(projectId, 4);
    expect(newQueries.find((q) => q.query === 'new-q')).toMatchObject({ clicks: 8, impressions: 80 });
    expect(lostQueries.find((q) => q.query === 'lost-q')).toMatchObject({ clicks: 12, impressions: 150 });
    expect(newQueries.map((q) => q.query)).not.toContain('lost-q');
    expect(lostQueries.map((q) => q.query)).not.toContain('new-q');
  });

  it('flags a CTR opportunity that clears the 0.6x threshold and excludes a near-miss', async () => {
    const { client } = await sessionForNewClientUser('ctropp');
    const projectId = await seedProject(client.id, 'ctropp.example.com');
    // position bucket 5 -> expected ctr 0.05; 0.6x threshold = 0.03.
    await insertQueryDaily([
      { projectId, clientId: client.id, date: '2026-03-15', query: 'opportunity-q', clicks: 20, impressions: 1000, position: 5 }, // ctr 0.02 < 0.03
      { projectId, clientId: client.id, date: '2026-03-15', query: 'near-miss-q', clicks: 40, impressions: 1000, position: 5 }, // ctr 0.04 >= 0.03
    ]);

    const opportunities = await getCtrOpportunities(projectId, 4);
    const queries = opportunities.map((o) => o.query);
    expect(queries).toContain('opportunity-q');
    expect(queries).not.toContain('near-miss-q');
  });

  it('striking distance excludes position 4.9 and includes 5.0', async () => {
    const { client } = await sessionForNewClientUser('striking');
    const projectId = await seedProject(client.id, 'striking.example.com');
    await insertQueryDaily([
      { projectId, clientId: client.id, date: '2026-03-15', query: 'sd-below', clicks: 5, impressions: 100, position: 4.9 },
      { projectId, clientId: client.id, date: '2026-03-15', query: 'sd-at', clicks: 5, impressions: 100, position: 5.0 },
    ]);

    const striking = await getStrikingDistance(projectId, 4);
    const queries = striking.map((s) => s.query);
    expect(queries).not.toContain('sd-below');
    expect(queries).toContain('sd-at');
  });

  it('page decay excludes a 29% decline and includes a 30% decline', async () => {
    const { client } = await sessionForNewClientUser('pagedecay');
    const projectId = await seedProject(client.id, 'pagedecay.example.com');
    await insertPageDaily([
      // previous window (both pages): 100 clicks on 2026-03-09.
      { projectId, clientId: client.id, date: '2026-03-09', page: '/decay-29', clicks: 100, impressions: 1000, position: 5 },
      { projectId, clientId: client.id, date: '2026-03-09', page: '/decay-30', clicks: 100, impressions: 1000, position: 5 },
      // current window: 71 clicks (29% decline, excluded) vs 70 clicks (30% decline, included).
      { projectId, clientId: client.id, date: '2026-03-14', page: '/decay-29', clicks: 71, impressions: 1000, position: 5 },
      { projectId, clientId: client.id, date: '2026-03-14', page: '/decay-30', clicks: 70, impressions: 1000, position: 5 },
    ]);

    const decay = await getPageDecay(projectId, 4);
    const pages = decay.map((d) => d.page);
    expect(pages).not.toContain('/decay-29');
    expect(pages).toContain('/decay-30');
    expect(decay.find((d) => d.page === '/decay-30')).toMatchObject({ clicks: 70, prevClicks: 100, declinePct: 30 });
  });

  it('returns empty structures for a project with no imported GSC data', async () => {
    const { client } = await sessionForNewClientUser('empty');
    const projectId = await seedProject(client.id, 'empty.example.com');

    await expect(getSearchOverview(projectId)).resolves.toEqual({
      series: [],
      totals: { clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0 },
    });
    await expect(getWinnersLosers(projectId)).resolves.toEqual({ winners: [], losers: [] });
    await expect(getNewLostQueries(projectId)).resolves.toEqual({ newQueries: [], lostQueries: [] });
    await expect(getCtrOpportunities(projectId)).resolves.toEqual([]);
    await expect(getStrikingDistance(projectId)).resolves.toEqual([]);
    await expect(getPageDecay(projectId)).resolves.toEqual([]);
  });
});
