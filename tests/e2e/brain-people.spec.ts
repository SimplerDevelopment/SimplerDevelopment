/**
 * Brain People + Org Units + Expertise coverage.
 *
 * Covers the endpoints + invariants added in the brain-people branch
 * (Wave 1 → Wave 4):
 *   • people CRUD lifecycle
 *   • expertise-tag attach/detach
 *   • org-unit add-member, primary-flip, remove-member
 *   • manager-cycle guard
 *   • who-knows ranking (expertise level + primary org bonus)
 *   • merge expertise tags reattaches all people then deletes the source
 *
 * All tests are pure API (no browser page), use the existing `clientApi`
 * fixture from `tests/e2e/setup/fixtures.ts`, and clean up created records
 * in `finally` blocks so the suite is rerunnable. Each test uses a
 * per-test timestamp + random suffix to avoid cross-run / cross-test
 * collisions.
 *
 * Browser-driven UI specs (drag-tree, PersonPicker typeahead) are stubbed
 * with `test.skip` and TODO markers below — same pattern as the other
 * brain-* specs.
 *
 * Tagged `@brain` for selective runs.
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── Cleanup helpers ───────────────────────────────────────────────────────

async function deletePerson(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  await api.delete(`/api/portal/brain/people/${id}`).catch(() => null);
}

async function deleteOrgUnit(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  // `force=true` cascades children up one level and detaches members so
  // tests don't deadlock cleanup behind member-detach ordering.
  await api.delete(`/api/portal/brain/org-units/${id}?force=true`).catch(() => null);
}

async function deleteExpertiseTag(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  await api.delete(`/api/portal/brain/expertise-tags/${id}?force=true`).catch(() => null);
}

async function detachExpertise(
  api: import('./setup/api-client').ApiClient,
  personId: number,
  expertiseTagId: number,
): Promise<void> {
  await api
    .delete(`/api/portal/brain/people/${personId}/expertise?expertiseTagId=${expertiseTagId}`)
    .catch(() => null);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. People list returns empty for fresh tenant (well — empty of *our* token).
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain People — list empty for fresh tenant @brain @brain-people', () => {
  test('GET /people returns success envelope with items array; no records match a fresh token', async ({
    clientApi,
  }) => {
    const token = uniq();
    const res = await clientApi.get(
      `/api/portal/brain/people?search=${encodeURIComponent(token)}&limit=5`,
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data?.items)).toBe(true);
    // Token didn't exist before this test ran, so search must be empty.
    expect((res.data.data.items as unknown[]).length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full lifecycle: create person → list → get → patch → attach expertise
//    → detach → delete.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain People — full lifecycle @brain @brain-people', () => {
  test('create → list → get → patch → attach/detach expertise → delete', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let personId: number | null = null;
    let tagId: number | null = null;

    try {
      // CREATE person.
      const created = await clientApi.post('/api/portal/brain/people', {
        fullName: `Lifecycle Person ${ts}`,
        title: 'Engineer',
        status: 'active',
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      expect(created.data?.success).toBe(true);
      personId = created.data.data.id as number;
      expect(typeof personId).toBe('number');

      // LIST — search by full name token finds it.
      const listRes = await clientApi.get(
        `/api/portal/brain/people?search=${encodeURIComponent(ts)}&limit=20`,
      );
      expect(listRes.status).toBe(200);
      const listItems = listRes.data.data.items as Array<{ id: number; fullName: string }>;
      expect(listItems.some((p) => p.id === personId)).toBe(true);

      // GET by id — returns `person`, `manager`, `directReports`, `orgUnits`,
      // `expertise`. Manager is null and arrays are empty for a fresh person.
      const getRes = await clientApi.get(`/api/portal/brain/people/${personId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data?.success).toBe(true);
      expect(getRes.data.data.person.fullName).toBe(`Lifecycle Person ${ts}`);
      expect(getRes.data.data.person.title).toBe('Engineer');
      expect(getRes.data.data.manager).toBeNull();
      expect(Array.isArray(getRes.data.data.directReports)).toBe(true);
      expect(Array.isArray(getRes.data.data.orgUnits)).toBe(true);
      expect(Array.isArray(getRes.data.data.expertise)).toBe(true);

      // PATCH title + status.
      const patchRes = await clientApi.patch(`/api/portal/brain/people/${personId}`, {
        title: 'Staff Engineer',
        status: 'active',
      });
      expect(patchRes.status, JSON.stringify(patchRes.data)).toBe(200);
      expect(patchRes.data?.success).toBe(true);
      expect(patchRes.data.data.title).toBe('Staff Engineer');

      // CREATE expertise tag.
      const tag = await clientApi.post('/api/portal/brain/expertise-tags', {
        name: `e2e-people-tag-${ts}`,
      });
      expect(tag.status, JSON.stringify(tag.data)).toBe(200);
      expect(tag.data?.success).toBe(true);
      tagId = tag.data.data.id as number;

      // ATTACH expertise.
      const attach = await clientApi.post(
        `/api/portal/brain/people/${personId}/expertise`,
        { expertiseTagId: tagId, level: 3 },
      );
      expect(attach.status, JSON.stringify(attach.data)).toBe(200);
      expect(attach.data?.success).toBe(true);

      // GET person — expertise array now populated with the tag.
      const afterAttach = await clientApi.get(`/api/portal/brain/people/${personId}`);
      expect(afterAttach.status).toBe(200);
      const expertise = afterAttach.data.data.expertise as Array<{
        id?: number;
        tagId?: number;
        expertiseTagId?: number;
        level: number | null;
      }>;
      // The detail shape uses `tagId` (per `ExpertiseAttachment` in
      // lib/brain/people.ts), but we accept any key shape so this stays
      // resilient to minor renames.
      const found = expertise.find((e) =>
        e.tagId === tagId || e.id === tagId || e.expertiseTagId === tagId,
      );
      expect(found, `expected attached expertise tag in: ${JSON.stringify(expertise)}`).toBeTruthy();
      expect(found!.level).toBe(3);

      // DETACH expertise.
      const detach = await clientApi.delete(
        `/api/portal/brain/people/${personId}/expertise?expertiseTagId=${tagId}`,
      );
      expect(detach.status, JSON.stringify(detach.data)).toBe(200);
      expect(detach.data?.success).toBe(true);

      const afterDetach = await clientApi.get(`/api/portal/brain/people/${personId}`);
      expect(afterDetach.status).toBe(200);
      const exp2 = afterDetach.data.data.expertise as Array<{ tagId?: number; id?: number; expertiseTagId?: number }>;
      expect(
        exp2.some((e) => e.tagId === tagId || e.id === tagId || e.expertiseTagId === tagId),
      ).toBe(false);

      // DELETE person.
      const del = await clientApi.delete(`/api/portal/brain/people/${personId}`);
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data?.success).toBe(true);
      personId = null; // cleanup no-op below.

      // GET after delete → 404.
      const getAfter = await clientApi.get(
        `/api/portal/brain/people/${created.data.data.id}`,
      );
      expect(getAfter.status).toBe(404);
    } finally {
      if (personId != null) await deletePerson(clientApi, personId);
      if (tagId != null) await deleteExpertiseTag(clientApi, tagId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Manager-cycle guard — PATCH that introduces a loop is rejected.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain People — manager cycle guard @brain @brain-people', () => {
  test('PATCH that closes a manager loop is rejected', async ({ clientApi }) => {
    const ts = uniq();
    let aId: number | null = null;
    let bId: number | null = null;

    try {
      // Create person A.
      const a = await clientApi.post('/api/portal/brain/people', {
        fullName: `Cycle A ${ts}`,
      });
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      aId = a.data.data.id as number;

      // Create person B with manager = A.
      const b = await clientApi.post('/api/portal/brain/people', {
        fullName: `Cycle B ${ts}`,
        managerId: aId,
      });
      expect(b.status, JSON.stringify(b.data)).toBe(200);
      bId = b.data.data.id as number;

      // Attempt to set A.manager = B — should close the loop (A → B → A).
      const patch = await clientApi.patch(`/api/portal/brain/people/${aId}`, {
        managerId: bId,
      });
      // The guard returns a 4xx (the route maps lib errors to 400). Be
      // permissive on exact code but require non-success.
      expect(patch.status, JSON.stringify(patch.data)).toBeGreaterThanOrEqual(400);
      expect(patch.data?.success).not.toBe(true);

      // A's manager should still be null.
      const getA = await clientApi.get(`/api/portal/brain/people/${aId}`);
      expect(getA.status).toBe(200);
      expect(getA.data.data.person.managerId).toBeNull();
    } finally {
      // Delete child first to satisfy FK ordering: B (manager=A) then A.
      if (bId != null) await deletePerson(clientApi, bId);
      if (aId != null) await deletePerson(clientApi, aId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Org-unit add-member → primary-flip → remove-member.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Org Units — member lifecycle @brain @brain-people @brain-org-units', () => {
  test('add member to unit A, add to unit B as primary, primary flips, then remove', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let personId: number | null = null;
    let unitAId: number | null = null;
    let unitBId: number | null = null;

    try {
      // Create person.
      const p = await clientApi.post('/api/portal/brain/people', {
        fullName: `OrgMember ${ts}`,
      });
      expect(p.status, JSON.stringify(p.data)).toBe(200);
      personId = p.data.data.id as number;

      // Create unit A.
      const a = await clientApi.post('/api/portal/brain/org-units', {
        name: `Unit A ${ts}`,
      });
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      unitAId = a.data.data.id as number;

      // Create unit B.
      const b = await clientApi.post('/api/portal/brain/org-units', {
        name: `Unit B ${ts}`,
      });
      expect(b.status, JSON.stringify(b.data)).toBe(200);
      unitBId = b.data.data.id as number;

      // Add to A as primary.
      const addA = await clientApi.post(
        `/api/portal/brain/org-units/${unitAId}/members`,
        { personId, primary: true, roleInUnit: 'Member' },
      );
      expect(addA.status, JSON.stringify(addA.data)).toBe(200);
      expect(addA.data?.success).toBe(true);

      // Verify A is primary on the person.
      const after1 = await clientApi.get(`/api/portal/brain/people/${personId}`);
      expect(after1.status).toBe(200);
      const ouA = (after1.data.data.orgUnits as Array<{ orgUnitId?: number; id?: number; primary: boolean }>)
        .find((u) => u.orgUnitId === unitAId || u.id === unitAId);
      expect(ouA, JSON.stringify(after1.data.data.orgUnits)).toBeTruthy();
      expect(ouA!.primary).toBe(true);

      // Add to B as primary → A.primary should flip to false.
      const addB = await clientApi.post(
        `/api/portal/brain/org-units/${unitBId}/members`,
        { personId, primary: true },
      );
      expect(addB.status, JSON.stringify(addB.data)).toBe(200);

      const after2 = await clientApi.get(`/api/portal/brain/people/${personId}`);
      expect(after2.status).toBe(200);
      const units2 = after2.data.data.orgUnits as Array<{ orgUnitId?: number; id?: number; primary: boolean }>;
      const ouA2 = units2.find((u) => u.orgUnitId === unitAId || u.id === unitAId);
      const ouB2 = units2.find((u) => u.orgUnitId === unitBId || u.id === unitBId);
      expect(ouA2, `expected A still attached: ${JSON.stringify(units2)}`).toBeTruthy();
      expect(ouB2, `expected B attached: ${JSON.stringify(units2)}`).toBeTruthy();
      expect(ouA2!.primary).toBe(false);
      expect(ouB2!.primary).toBe(true);

      // Remove from B → only A membership remains.
      const remB = await clientApi.delete(
        `/api/portal/brain/org-units/${unitBId}/members?personId=${personId}`,
      );
      expect(remB.status, JSON.stringify(remB.data)).toBe(200);
      expect(remB.data?.success).toBe(true);

      const after3 = await clientApi.get(`/api/portal/brain/people/${personId}`);
      const units3 = after3.data.data.orgUnits as Array<{ orgUnitId?: number; id?: number }>;
      expect(units3.length).toBe(1);
      expect(units3[0].orgUnitId === unitAId || units3[0].id === unitAId).toBe(true);
    } finally {
      if (personId != null) await deletePerson(clientApi, personId);
      if (unitAId != null) await deleteOrgUnit(clientApi, unitAId);
      if (unitBId != null) await deleteOrgUnit(clientApi, unitBId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Who-knows ranks by expertise level + primary org bonus.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Who-Knows — ranking @brain @brain-people @brain-who-knows', () => {
  test('person with level + primary org outranks person without', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const tagName = `e2e-who-knows-${ts}`;
    let tagId: number | null = null;
    let unitId: number | null = null;
    let p1Id: number | null = null; // higher-ranked
    let p2Id: number | null = null; // lower-ranked

    try {
      // Tag.
      const tag = await clientApi.post('/api/portal/brain/expertise-tags', {
        name: tagName,
      });
      expect(tag.status, JSON.stringify(tag.data)).toBe(200);
      tagId = tag.data.data.id as number;

      // Org unit.
      const unit = await clientApi.post('/api/portal/brain/org-units', {
        name: `WhoKnowsUnit ${ts}`,
      });
      expect(unit.status, JSON.stringify(unit.data)).toBe(200);
      unitId = unit.data.data.id as number;

      // Person 1 — has tag at level 4, primary on a unit.
      const p1 = await clientApi.post('/api/portal/brain/people', {
        fullName: `WhoKnows Hi ${ts}`,
      });
      expect(p1.status, JSON.stringify(p1.data)).toBe(200);
      p1Id = p1.data.data.id as number;
      await clientApi.post(`/api/portal/brain/people/${p1Id}/expertise`, {
        expertiseTagId: tagId,
        level: 4,
      });
      await clientApi.post(`/api/portal/brain/org-units/${unitId}/members`, {
        personId: p1Id,
        primary: true,
      });

      // Person 2 — has same tag with no level, no org unit.
      const p2 = await clientApi.post('/api/portal/brain/people', {
        fullName: `WhoKnows Lo ${ts}`,
      });
      expect(p2.status, JSON.stringify(p2.data)).toBe(200);
      p2Id = p2.data.data.id as number;
      await clientApi.post(`/api/portal/brain/people/${p2Id}/expertise`, {
        expertiseTagId: tagId,
        level: null,
      });

      // Who-knows.
      const wk = await clientApi.get(
        `/api/portal/brain/who-knows?query=${encodeURIComponent(tagName)}&limit=10`,
      );
      expect(wk.status, JSON.stringify(wk.data)).toBe(200);
      expect(wk.data?.success).toBe(true);
      const people = wk.data.data.people as Array<{ personId: number; score: number }>;
      expect(Array.isArray(people)).toBe(true);
      const i1 = people.findIndex((x) => x.personId === p1Id);
      const i2 = people.findIndex((x) => x.personId === p2Id);
      expect(i1, `p1 missing from results: ${JSON.stringify(people)}`).toBeGreaterThanOrEqual(0);
      expect(i2, `p2 missing from results: ${JSON.stringify(people)}`).toBeGreaterThanOrEqual(0);
      // Higher rank => earlier in array.
      expect(i1).toBeLessThan(i2);
      // Score should also reflect that.
      expect(people[i1].score).toBeGreaterThan(people[i2].score);
    } finally {
      // Detach expertise links first so the tag delete doesn't refuse.
      if (p1Id != null && tagId != null) await detachExpertise(clientApi, p1Id, tagId);
      if (p2Id != null && tagId != null) await detachExpertise(clientApi, p2Id, tagId);
      if (p1Id != null) await deletePerson(clientApi, p1Id);
      if (p2Id != null) await deletePerson(clientApi, p2Id);
      if (unitId != null) await deleteOrgUnit(clientApi, unitId);
      if (tagId != null) await deleteExpertiseTag(clientApi, tagId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Merge expertise tags re-attaches all people then deletes the source.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Expertise Tags — merge @brain @brain-people @brain-expertise', () => {
  test('merging source → target reattaches people and deletes the source tag', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let sourceId: number | null = null;
    let targetId: number | null = null;
    let p1Id: number | null = null;
    let p2Id: number | null = null;

    try {
      // Two tags.
      const src = await clientApi.post('/api/portal/brain/expertise-tags', {
        name: `e2e-merge-src-${ts}`,
      });
      expect(src.status, JSON.stringify(src.data)).toBe(200);
      sourceId = src.data.data.id as number;

      const tgt = await clientApi.post('/api/portal/brain/expertise-tags', {
        name: `e2e-merge-tgt-${ts}`,
      });
      expect(tgt.status, JSON.stringify(tgt.data)).toBe(200);
      targetId = tgt.data.data.id as number;

      // Two people, both attached to source.
      const p1 = await clientApi.post('/api/portal/brain/people', { fullName: `Merge P1 ${ts}` });
      expect(p1.status).toBe(200);
      p1Id = p1.data.data.id as number;
      await clientApi.post(`/api/portal/brain/people/${p1Id}/expertise`, {
        expertiseTagId: sourceId,
        level: 2,
      });

      const p2 = await clientApi.post('/api/portal/brain/people', { fullName: `Merge P2 ${ts}` });
      expect(p2.status).toBe(200);
      p2Id = p2.data.data.id as number;
      await clientApi.post(`/api/portal/brain/people/${p2Id}/expertise`, {
        expertiseTagId: sourceId,
        level: null,
      });

      // Merge source → target.
      const merge = await clientApi.post(
        `/api/portal/brain/expertise-tags/${sourceId}/merge`,
        { targetTagId: targetId },
      );
      expect(merge.status, JSON.stringify(merge.data)).toBe(200);
      expect(merge.data?.success).toBe(true);
      // Lib returns `{ reattached }`; route echoes back as `data`. Accept any
      // truthy reattach count.
      const reattached = (merge.data.data?.reattached ?? merge.data.data?.peopleReattached ?? 0) as number;
      expect(reattached).toBeGreaterThanOrEqual(2);

      // Source tag should be gone — GET by id 404, and listing under the
      // unique name returns nothing.
      const sourceList = await clientApi.get(
        `/api/portal/brain/expertise-tags?search=${encodeURIComponent(`e2e-merge-src-${ts}`)}`,
      );
      expect(sourceList.status).toBe(200);
      const items = sourceList.data.data.items as Array<{ id: number }>;
      expect(items.some((it) => it.id === sourceId)).toBe(false);
      sourceId = null; // already deleted by merge.

      // Both people now point at target.
      const after1 = await clientApi.get(`/api/portal/brain/people/${p1Id}`);
      const e1 = after1.data.data.expertise as Array<{ tagId?: number; id?: number; expertiseTagId?: number }>;
      expect(e1.some((e) => e.tagId === targetId || e.id === targetId || e.expertiseTagId === targetId)).toBe(true);

      const after2 = await clientApi.get(`/api/portal/brain/people/${p2Id}`);
      const e2 = after2.data.data.expertise as Array<{ tagId?: number; id?: number; expertiseTagId?: number }>;
      expect(e2.some((e) => e.tagId === targetId || e.id === targetId || e.expertiseTagId === targetId)).toBe(true);
    } finally {
      if (p1Id != null && targetId != null) await detachExpertise(clientApi, p1Id, targetId);
      if (p2Id != null && targetId != null) await detachExpertise(clientApi, p2Id, targetId);
      if (p1Id != null) await deletePerson(clientApi, p1Id);
      if (p2Id != null) await deletePerson(clientApi, p2Id);
      if (sourceId != null) await deleteExpertiseTag(clientApi, sourceId);
      if (targetId != null) await deleteExpertiseTag(clientApi, targetId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Browser-driven UI specs — deferred. Same pattern as the other brain-*
//    surfaces. Org-chart drag tree and PersonPicker typeahead need a real
//    page driver that this branch doesn't ship.
// ───────────────────────────────────────────────────────────────────────────

test.skip('Brain People UI — PersonPicker typeahead selects + clears @brain @brain-people-ui', () => {
  // TODO: drive components/brain/PersonPicker.tsx — type into the input,
  // wait for debounced /api/portal/brain/people?search=... fetch, click a
  // row, assert the selected pill renders and clear-button restores the
  // empty input.
});

test.skip('Brain Org Chart UI — drag-and-drop re-parents the unit @brain @brain-people-ui @brain-org-units', () => {
  // TODO: drive app/portal/brain/org-chart/page.tsx — drag a unit node onto
  // a different parent, await the underlying POST to .../move, assert the
  // tree re-renders with the unit under its new parent.
});
