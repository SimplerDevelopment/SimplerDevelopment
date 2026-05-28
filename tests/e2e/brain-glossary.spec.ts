/**
 * Brain Glossary — Wave 4 E2E coverage.
 *
 * API-driven specs that mirror the canonical brain spec shape
 * (`brain-knowledge.spec.ts`). No browser pages — every test uses the
 * `clientApi` fixture and cleans up after itself in a `finally` block so the
 * suite is rerunnable.
 *
 * Coverage:
 *   1. Empty-list smoke for a fresh tenant (filtered slice).
 *   2. Full lifecycle: create → list → get → patch → lookup → delete.
 *   3. Slug uniqueness suffixing on per-tenant collision (`-2`, `-3`, …).
 *   4. Lookup ranking: term-exact > alias-exact > term-prefix > alias-prefix >
 *      term-substring > alias-substring > definition-substring.
 *   5. Bulk-import: creates new + updates existing on slug conflict.
 *   6. Delete prunes the term id from sibling terms' relatedTermIds arrays.
 *   7. Tenancy isolation: client-A glossary invisible to client-B.
 *
 * Tagged `@brain` (NOT `@critical`) — selective runs only.
 */
import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function hardDeleteTerm(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  await api.delete(`/api/portal/brain/glossary/${id}`).catch(() => null);
}

async function hardDeleteAll(
  api: import('./setup/api-client').ApiClient,
  ids: number[],
): Promise<void> {
  for (const id of ids) {
    if (typeof id === 'number') await hardDeleteTerm(api, id);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Empty-list smoke
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — empty list @brain @brain-glossary-empty', () => {
  test('glossary list returns empty for fresh tenant', async ({ clientApi }) => {
    // The seed tenant may have leftover glossary entries from prior runs, so
    // assert against an empty *filtered* slice instead of total emptiness.
    // We use a category that should never match any seed row (random per-run).
    const noSuchCategory = `e2e-no-such-cat-${uniq()}`;
    const res = await clientApi.get(
      `/api/portal/brain/glossary?category=${encodeURIComponent(noSuchCategory)}`,
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data?.success).toBe(true);
    const items: unknown[] = res.data.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(0);
    expect(res.data.data.total).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full lifecycle
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — lifecycle @brain @brain-glossary-lifecycle', () => {
  test('lifecycle: create → list → get → patch → lookup → delete', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const term = `LifeCycle-${ts}`;
    const definition = `Lifecycle definition for ${ts}.`;
    let id: number | null = null;

    try {
      // CREATE
      const create = await clientApi.post('/api/portal/brain/glossary', {
        term,
        definition,
        shortDefinition: 'short def',
        aliases: [`lc-alias-${ts}`],
        category: `cat-${ts}`,
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      expect(create.data?.success).toBe(true);
      id = create.data.data.id as number;
      expect(typeof id).toBe('number');
      const createdSlug: string = create.data.data.slug;
      expect(createdSlug).toMatch(/^lifecycle-/);

      // LIST default — entry present (filter by category for determinism).
      const listInitial = await clientApi.get(
        `/api/portal/brain/glossary?category=${encodeURIComponent(`cat-${ts}`)}`,
      );
      expect(listInitial.status).toBe(200);
      expect(listInitial.data?.success).toBe(true);
      const items: Array<{ id: number; term: string; aliasCount: number }> =
        listInitial.data.data.items;
      const hit = items.find((n) => n.id === id);
      expect(hit, JSON.stringify(items)).toBeTruthy();
      expect(hit!.aliasCount).toBe(1);

      // GET by id — includes relatedTerms.
      const got = await clientApi.get(`/api/portal/brain/glossary/${id}`);
      expect(got.status).toBe(200);
      expect(got.data?.success).toBe(true);
      expect(got.data?.data?.term?.id).toBe(id);
      expect(Array.isArray(got.data?.data?.relatedTerms)).toBe(true);

      // PATCH definition + add alias.
      const patch = await clientApi.patch(`/api/portal/brain/glossary/${id}`, {
        definition: `${definition} (edited)`,
        aliases: [`lc-alias-${ts}`, `lc-alias-2-${ts}`],
      });
      expect(patch.status, JSON.stringify(patch.data)).toBe(200);
      expect(patch.data?.success).toBe(true);
      expect(patch.data?.data?.definition).toBe(`${definition} (edited)`);
      expect(Array.isArray(patch.data?.data?.aliases)).toBe(true);
      expect(patch.data?.data?.aliases.length).toBe(2);

      // LOOKUP — term-exact match.
      const lookup = await clientApi.post('/api/portal/brain/glossary/lookup', {
        query: term,
      });
      expect(lookup.status).toBe(200);
      expect(lookup.data?.success).toBe(true);
      const matches: Array<{ id: number; matchType: string; score: number }> =
        lookup.data.data.matches;
      const exact = matches.find((m) => m.id === id);
      expect(exact, JSON.stringify(matches)).toBeTruthy();
      expect(exact!.matchType).toBe('exact_term');
      expect(exact!.score).toBe(10);

      // DELETE
      const del = await clientApi.delete(`/api/portal/brain/glossary/${id}`);
      expect(del.status).toBe(200);
      expect(del.data?.success).toBe(true);
      expect(del.data?.data?.deleted).toBe(true);

      // GET after delete — 404.
      const getAfter = await clientApi.get(`/api/portal/brain/glossary/${id}`);
      expect(getAfter.status).toBe(404);

      id = null;
    } finally {
      if (id != null) await hardDeleteTerm(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Slug uniqueness suffixing
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — slug suffixing @brain @brain-glossary-slug', () => {
  test('slug uniqueness suffixes on per-tenant collision', async ({ clientApi }) => {
    const ts = uniq();
    const sharedTerm = `SlugCollide-${ts}`;
    const created: number[] = [];

    try {
      const a = await clientApi.post('/api/portal/brain/glossary', {
        term: sharedTerm,
        definition: 'First insertion.',
      });
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      created.push(a.data.data.id);
      const slugA: string = a.data.data.slug;

      const b = await clientApi.post('/api/portal/brain/glossary', {
        term: sharedTerm,
        definition: 'Second insertion — same term, expect -2 suffix.',
      });
      expect(b.status, JSON.stringify(b.data)).toBe(200);
      created.push(b.data.data.id);
      const slugB: string = b.data.data.slug;

      const c = await clientApi.post('/api/portal/brain/glossary', {
        term: sharedTerm,
        definition: 'Third — expect -3 suffix.',
      });
      expect(c.status, JSON.stringify(c.data)).toBe(200);
      created.push(c.data.data.id);
      const slugC: string = c.data.data.slug;

      // Same canonical base.
      expect(slugA.startsWith('slugcollide-')).toBe(true);
      expect(slugB.startsWith('slugcollide-')).toBe(true);
      expect(slugC.startsWith('slugcollide-')).toBe(true);

      // All distinct.
      expect(new Set([slugA, slugB, slugC]).size).toBe(3);
      // Suffixed candidates contain `-2` and `-3`.
      const slugs = [slugA, slugB, slugC];
      expect(slugs.some((s) => /-2$/.test(s))).toBe(true);
      expect(slugs.some((s) => /-3$/.test(s))).toBe(true);
    } finally {
      await hardDeleteAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Lookup ranking
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — lookup ranking @brain @brain-glossary-lookup', () => {
  test(
    'lookup ranks term-exact > alias-exact > term-prefix > alias-prefix > term-substring > alias-substring > definition-substring',
    async ({ clientApi }) => {
      // Query token chosen so each candidate row matches a *different* rank
      // bucket — the bucket order is the implementation's score ladder.
      const tok = uniq().slice(0, 8); // short token to keep matches deterministic
      const query = `ZZ${tok}`; // unique enough to avoid colliding with seeds
      const queryLower = query.toLowerCase();

      // 7 candidates, one per match-type bucket.
      const candidates: Array<{
        kind: string;
        term: string;
        definition: string;
        aliases?: string[];
      }> = [
        // term-exact (score 10)
        { kind: 'exact_term', term: query, definition: 'Exact term row.' },
        // alias-exact (score 8)
        {
          kind: 'exact_alias',
          term: `Other-${tok}-alias-exact`,
          definition: 'Alias exact row.',
          aliases: [query],
        },
        // term-prefix (score 5) — term STARTS with query but isn't equal
        {
          kind: 'term_prefix',
          term: `${query}-prefix-extra`,
          definition: 'Term-prefix row.',
        },
        // alias-prefix (score 4)
        {
          kind: 'alias_prefix',
          term: `Other-${tok}-alias-prefix`,
          definition: 'Alias-prefix row.',
          aliases: [`${query}-tail`],
        },
        // term-substring (score 3) — query appears mid-string
        {
          kind: 'term_substring',
          term: `lead-${query}-tail`,
          definition: 'Term-substring row.',
        },
        // alias-substring (score 2)
        {
          kind: 'alias_substring',
          term: `Other-${tok}-alias-sub`,
          definition: 'Alias-substring row.',
          aliases: [`lead-${query}-tail`],
        },
        // definition-substring (score 1)
        {
          kind: 'definition_substring',
          term: `Other-${tok}-def-sub`,
          definition: `An unrelated term whose body mentions ${query} somewhere.`,
        },
      ];

      const ids: number[] = [];

      try {
        for (const c of candidates) {
          const res = await clientApi.post('/api/portal/brain/glossary', {
            term: c.term,
            definition: c.definition,
            aliases: c.aliases ?? [],
          });
          expect(res.status, JSON.stringify(res.data)).toBe(200);
          ids.push(res.data.data.id as number);
        }

        const lookup = await clientApi.post('/api/portal/brain/glossary/lookup', {
          query,
          limit: 25,
        });
        expect(lookup.status, JSON.stringify(lookup.data)).toBe(200);
        expect(lookup.data?.success).toBe(true);

        const allMatches: Array<{
          id: number;
          matchType: string;
          score: number;
          term: string;
        }> = lookup.data.data.matches;

        // Filter to just the candidates we created (the seed tenant may have
        // ambient glossary rows). Use the id set.
        const idSet = new Set(ids);
        const matches = allMatches.filter((m) => idSet.has(m.id));

        // All 7 should match.
        expect(
          matches.length,
          `expected 7 of our candidate ids in the match set, got ${matches.length}: ${JSON.stringify(matches)}`,
        ).toBe(7);

        // Scores are monotonically non-increasing as returned.
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
        }

        // Each match-type bucket appears exactly once with its expected score.
        const byType = new Map<string, number>();
        for (const m of matches) byType.set(m.matchType, m.score);

        // The top match must be exact_term with score 10.
        expect(matches[0].matchType).toBe('exact_term');
        expect(matches[0].score).toBe(10);
        // The exact_term row's normalized term equals the query.
        expect(matches[0].term.toLowerCase()).toBe(queryLower);

        // Score ladder per match-type (lib/brain/glossary.ts).
        expect(byType.get('exact_term')).toBe(10);
        expect(byType.get('exact_alias')).toBe(8);
        expect(byType.get('term_prefix')).toBe(5);
        expect(byType.get('alias_prefix')).toBe(4);
        expect(byType.get('term_substring')).toBe(3);
        expect(byType.get('alias_substring')).toBe(2);
        expect(byType.get('definition_substring')).toBe(1);

        // Bucket *ordering* in the returned list.
        const order = matches.map((m) => m.matchType);
        const expectedOrder = [
          'exact_term',
          'exact_alias',
          'term_prefix',
          'alias_prefix',
          'term_substring',
          'alias_substring',
          'definition_substring',
        ];
        expect(order, JSON.stringify(matches)).toEqual(expectedOrder);
      } finally {
        await hardDeleteAll(clientApi, ids);
      }
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Bulk import
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — bulk import @brain @brain-glossary-bulk', () => {
  test('bulk-import creates new + updates existing on slug conflict', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const termA = `Bulk-A-${ts}`;
    const termB = `Bulk-B-${ts}`;
    const termC = `Bulk-C-${ts}`;
    const created: number[] = [];

    try {
      // First pass — all three NEW.
      const first = await clientApi.post(
        '/api/portal/brain/glossary/bulk-import',
        {
          terms: [
            { term: termA, definition: 'A initial.' },
            { term: termB, definition: 'B initial.' },
            { term: termC, definition: 'C initial.' },
          ],
        },
      );
      expect(first.status, JSON.stringify(first.data)).toBe(200);
      expect(first.data?.success).toBe(true);
      expect(first.data?.data?.created).toBe(3);
      expect(first.data?.data?.updated).toBe(0);
      expect(first.data?.data?.errors?.length ?? 0).toBe(0);

      // Locate the created ids so we can clean them up.
      const cleanupSearch = await clientApi.get(
        `/api/portal/brain/glossary?search=${encodeURIComponent(`-${ts}`)}&limit=100`,
      );
      expect(cleanupSearch.status).toBe(200);
      const found: Array<{ id: number; term: string }> =
        cleanupSearch.data.data.items;
      for (const row of found) {
        if ([termA, termB, termC].includes(row.term)) created.push(row.id);
      }
      expect(created.length).toBe(3);

      // Second pass — A and B re-imported (slug collision -> updated), one NEW.
      const termD = `Bulk-D-${ts}`;
      const second = await clientApi.post(
        '/api/portal/brain/glossary/bulk-import',
        {
          terms: [
            { term: termA, definition: 'A updated.' },
            { term: termB, definition: 'B updated.' },
            { term: termD, definition: 'D initial.' },
          ],
        },
      );
      expect(second.status, JSON.stringify(second.data)).toBe(200);
      expect(second.data?.success).toBe(true);
      expect(second.data?.data?.created).toBe(1);
      expect(second.data?.data?.updated).toBe(2);
      expect(second.data?.data?.errors?.length ?? 0).toBe(0);

      // Capture D's id for cleanup.
      const cleanupSearch2 = await clientApi.get(
        `/api/portal/brain/glossary?search=${encodeURIComponent(`-${ts}`)}&limit=100`,
      );
      const found2: Array<{ id: number; term: string }> =
        cleanupSearch2.data.data.items;
      const dRow = found2.find((r) => r.term === termD);
      expect(dRow, JSON.stringify(found2)).toBeTruthy();
      created.push(dRow!.id);

      // Verify A's definition was actually updated.
      const aRow = found2.find((r) => r.term === termA);
      expect(aRow).toBeTruthy();
      const aGet = await clientApi.get(`/api/portal/brain/glossary/${aRow!.id}`);
      expect(aGet.status).toBe(200);
      expect(aGet.data?.data?.term?.definition).toBe('A updated.');
    } finally {
      await hardDeleteAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Delete prunes relatedTermIds from siblings
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — delete prunes related ids @brain @brain-glossary-prune', () => {
  test('delete prunes the term id from other terms relatedTermIds arrays', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const created: number[] = [];
    let targetId: number | null = null;
    let referrerId: number | null = null;
    let secondReferrerId: number | null = null;

    try {
      // Create the target.
      const target = await clientApi.post('/api/portal/brain/glossary', {
        term: `Target-${ts}`,
        definition: 'I will be deleted.',
      });
      expect(target.status, JSON.stringify(target.data)).toBe(200);
      targetId = target.data.data.id as number;
      created.push(targetId);

      // Create two referrers that point at the target.
      const refA = await clientApi.post('/api/portal/brain/glossary', {
        term: `Referrer-A-${ts}`,
        definition: 'See also target.',
        relatedTermIds: [targetId],
      });
      expect(refA.status, JSON.stringify(refA.data)).toBe(200);
      referrerId = refA.data.data.id as number;
      created.push(referrerId);

      const refB = await clientApi.post('/api/portal/brain/glossary', {
        term: `Referrer-B-${ts}`,
        definition: 'Also see target.',
        relatedTermIds: [targetId],
      });
      expect(refB.status, JSON.stringify(refB.data)).toBe(200);
      secondReferrerId = refB.data.data.id as number;
      created.push(secondReferrerId);

      // Sanity — pre-delete the referrer.relatedTermIds contains targetId.
      const preGet = await clientApi.get(
        `/api/portal/brain/glossary/${referrerId}`,
      );
      expect(preGet.status).toBe(200);
      const preIds: number[] = preGet.data.data.term.relatedTermIds ?? [];
      expect(preIds).toContain(targetId);

      // DELETE the target — server should prune referrers.
      const del = await clientApi.delete(
        `/api/portal/brain/glossary/${targetId}`,
      );
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data?.success).toBe(true);
      expect(del.data?.data?.deleted).toBe(true);
      expect(del.data?.data?.prunedRelatedTermFromCount).toBe(2);
      // Clear targetId so cleanup doesn't double-delete.
      created.splice(created.indexOf(targetId), 1);
      targetId = null;

      // Confirm both referrers no longer carry the (now-stale) target id.
      // We re-read the original target id from `target.data.data.id` since we
      // cleared the local `targetId` variable above.
      const originalTargetId = target.data.data.id as number;
      for (const refId of [referrerId, secondReferrerId]) {
        const post = await clientApi.get(
          `/api/portal/brain/glossary/${refId}`,
        );
        expect(post.status).toBe(200);
        const postIds: number[] = post.data.data.term.relatedTermIds ?? [];
        expect(postIds).not.toContain(originalTargetId);
      }
    } finally {
      await hardDeleteAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Tenancy isolation
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Glossary — tenancy isolation @brain @brain-glossary-tenancy', () => {
  test('tenancy isolation: client A glossary invisible to client B', async ({
    clientApi,
  }) => {
    // The default seed has only one "client" portal user (client@example.com /
    // client 102 — Acme Corp) and the admin (which is NOT a client). Without a
    // second client account in the env we can't compare two real tenants here.
    // The defensive test is to (a) create a term as client A and (b) hit GET
    // by id with an unauth context — the route requires entitlement and must
    // 401/403 rather than leak.
    const ts = uniq();
    let id: number | null = null;
    const adminApi = new ApiClient(
      process.env.ADMIN_EMAIL || 'admin@example.com',
      process.env.ADMIN_PASSWORD || 'admin123',
    );
    await adminApi.ensure();
    const unauthApi = new ApiClient();
    await unauthApi.ensure();

    try {
      const create = await clientApi.post('/api/portal/brain/glossary', {
        term: `Tenancy-${ts}`,
        definition: 'Private to client A.',
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      id = create.data.data.id as number;

      // Unauthenticated context — must NOT see the row.
      const unauthGet = await unauthApi.get(`/api/portal/brain/glossary/${id}`);
      expect(unauthGet.status).not.toBe(200);

      // Admin user is not a portal "client" and `requireBrainEntitlement`
      // resolves to a different (or no) client context; the route MUST NOT
      // return client A's record. Accept either 401/403 (no client context)
      // or 404 (different/empty client context) — both are non-leaks.
      const adminGet = await adminApi.get(`/api/portal/brain/glossary/${id}`);
      expect(adminGet.status).not.toBe(200);

      // Sanity — original client A still sees the row.
      const ownGet = await clientApi.get(`/api/portal/brain/glossary/${id}`);
      expect(ownGet.status).toBe(200);
      expect(ownGet.data?.success).toBe(true);
      expect(ownGet.data?.data?.term?.id).toBe(id);
    } finally {
      if (id != null) await hardDeleteTerm(clientApi, id);
      await adminApi.dispose();
      await unauthApi.dispose();
    }
  });
});
