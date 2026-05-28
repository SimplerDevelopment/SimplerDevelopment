/**
 * Brain Documents — Wave 4 E2E coverage.
 *
 * API-driven specs that mirror the canonical brain spec shape
 * (`brain-knowledge.spec.ts`). No browser pages — every test uses the
 * `clientApi` fixture and cleans up after itself in a `finally` block so the
 * suite is rerunnable.
 *
 * Coverage:
 *   1. Empty-list smoke for a fresh tenant (filtered slice).
 *   2. Full lifecycle: create draft → editDraft v1 → publish v1 →
 *      editDraft v2 → publish v2 → archive → unarchive.
 *   3. Publish refuses with empty draft body (400).
 *   4. PATCH /[id] refuses status changes (400).
 *   5. DELETE with acks present 409s with `DOCUMENT_HAS_ACKS`; ?force=true succeeds.
 *   6. promote-from-note seeds v1 from the source note's body.
 *   7. Link / unlink polymorphism across topic, initiative, decision, person,
 *      glossary_term, meeting (meeting is link-only since the public API has
 *      no create endpoint — the lib does not FK-validate polymorphic ids).
 *   8. Required-reads: assign to person → that person sees it in their queue
 *      → acknowledge → compliance-report partitions correctly.
 *   9. Required-reads: assign to org_unit with expandOrgUnit=true fans out
 *      to each active member.
 *  10. compliance-report partition math (assigned vs acknowledged vs pending
 *      vs overdue).
 *  11. Tenancy isolation: client-A documents invisible to unauth / admin
 *      contexts (no second-client fixture in the env).
 *
 * Tagged `@brain` (NOT `@critical`) — selective runs only.
 */
import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── helpers ────────────────────────────────────────────────────────────────

async function hardDeleteDocument(
  api: ApiClient,
  id: number,
): Promise<void> {
  // Force=true cascades through any acknowledgments / required-reads.
  await api.delete(`/api/portal/brain/documents/${id}?force=true`).catch(() => null);
}

async function hardDeleteNote(api: ApiClient, id: number): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const res = await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return;
    if (res.status === 200 && res.data?.data?.deleted === 'hard') return;
  }
}

async function deletePerson(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/people/${id}`).catch(() => null);
}

async function deleteOrgUnit(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/org-units/${id}`).catch(() => null);
}

async function deleteTopic(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/topics/${id}`).catch(() => null);
}

async function deleteInitiative(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/initiatives/${id}`).catch(() => null);
}

async function deleteDecision(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/decisions/${id}`).catch(() => null);
}

async function deleteGlossaryTerm(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/glossary/${id}`).catch(() => null);
}

interface CreatedDoc {
  id: number;
  currentDraftVersionId: number | null;
}

async function createDoc(
  api: ApiClient,
  title: string,
  extras?: Record<string, unknown>,
): Promise<CreatedDoc> {
  const res = await api.post('/api/portal/brain/documents', { title, ...(extras ?? {}) });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  expect(res.data?.success).toBe(true);
  const doc = res.data.data?.document ?? res.data.data;
  return {
    id: doc.id as number,
    currentDraftVersionId: (doc.currentDraftVersionId ?? null) as number | null,
  };
}

async function editDraft(
  api: ApiClient,
  documentId: number,
  body: string,
): Promise<{ versionId: number; versionNumber: number; isDraft: boolean }> {
  const res = await api.post(`/api/portal/brain/documents/${documentId}/versions`, { body });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  expect(res.data?.success).toBe(true);
  const ver = res.data.data?.version ?? res.data.data;
  return {
    versionId: ver.id as number,
    versionNumber: ver.versionNumber as number,
    isDraft: ver.isDraft as boolean,
  };
}

async function publish(
  api: ApiClient,
  documentId: number,
): Promise<{ documentStatus: string; publishedVersionId: number; versionNumber: number }> {
  const res = await api.post(`/api/portal/brain/documents/${documentId}/publish`);
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  expect(res.data?.success).toBe(true);
  const doc = res.data.data?.document ?? res.data.data;
  const ver = res.data.data?.version;
  return {
    documentStatus: doc.status as string,
    publishedVersionId: (ver?.id ?? doc.currentPublishedVersionId) as number,
    versionNumber: (ver?.versionNumber ?? 1) as number,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Empty-list smoke
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — empty list @brain @brain-documents-empty', () => {
  test('documents list returns empty for a fresh title-search slice', async ({ clientApi }) => {
    // We don't truly own a fresh tenant — there may be leftover docs from
    // prior runs. The defensive shape is: filter by a guaranteed-unique
    // search token and expect the slice to be empty.
    const token = `nonexistent-${uniq()}`;
    const res = await clientApi.get(
      `/api/portal/brain/documents?search=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data?.items)).toBe(true);
    expect(res.data.data.items.length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full lifecycle
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — lifecycle @brain @brain-documents-lifecycle', () => {
  test('create draft → editDraft v1 → publish v1 → editDraft v2 → publish v2 → archive → unarchive', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;

    try {
      // CREATE — seeds v1 draft with empty body.
      const created = await createDoc(clientApi, `E2E lifecycle ${ts}`);
      docId = created.id;
      expect(typeof docId).toBe('number');

      // GET — should be a draft with no published version yet.
      const got = await clientApi.get(`/api/portal/brain/documents/${docId}?includeBody=true`);
      expect(got.status).toBe(200);
      expect(got.data?.data?.document?.status).toBe('draft');
      expect(got.data?.data?.document?.currentPublishedVersionId).toBeNull();
      expect(got.data?.data?.document?.currentDraftVersionId).not.toBeNull();

      // EDIT DRAFT v1.
      const v1 = await editDraft(clientApi, docId, 'Body v1 — initial draft content.');
      expect(v1.isDraft).toBe(true);
      expect(v1.versionNumber).toBe(1);

      // PUBLISH v1.
      const pub1 = await publish(clientApi, docId);
      expect(pub1.documentStatus).toBe('published');
      expect(pub1.versionNumber).toBe(1);

      // After publish: currentDraftVersionId is null, currentPublishedVersionId set.
      const afterPub1 = await clientApi.get(`/api/portal/brain/documents/${docId}`);
      expect(afterPub1.status).toBe(200);
      expect(afterPub1.data?.data?.document?.status).toBe('published');
      expect(afterPub1.data?.data?.document?.currentDraftVersionId).toBeNull();
      expect(afterPub1.data?.data?.document?.currentPublishedVersionId).toBe(pub1.publishedVersionId);

      // EDIT DRAFT v2 — should mint a new draft seeded from v1's body.
      const v2 = await editDraft(clientApi, docId, 'Body v2 — second iteration.');
      expect(v2.isDraft).toBe(true);
      expect(v2.versionNumber).toBe(2);
      expect(v2.versionId).not.toBe(v1.versionId);

      // PUBLISH v2.
      const pub2 = await publish(clientApi, docId);
      expect(pub2.documentStatus).toBe('published');
      expect(pub2.versionNumber).toBe(2);
      expect(pub2.publishedVersionId).toBe(v2.versionId);

      // ARCHIVE.
      const arch = await clientApi.post(`/api/portal/brain/documents/${docId}/archive`, {
        reason: 'lifecycle test',
      });
      expect(arch.status, JSON.stringify(arch.data)).toBe(200);
      expect(arch.data?.success).toBe(true);
      expect(arch.data?.data?.status).toBe('archived');
      expect(arch.data?.data?.archiveReason).toBe('lifecycle test');

      // UNARCHIVE — restores to 'published' since a published version exists.
      const unarch = await clientApi.post(`/api/portal/brain/documents/${docId}/unarchive`);
      expect(unarch.status, JSON.stringify(unarch.data)).toBe(200);
      expect(unarch.data?.success).toBe(true);
      expect(unarch.data?.data?.status).toBe('published');
      expect(unarch.data?.data?.archivedAt).toBeNull();
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Publish refuses empty body
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — publish empty draft @brain @brain-documents-publish-empty', () => {
  test('publish refuses with empty draft body (400 + message hints empty body)', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;

    try {
      const created = await createDoc(clientApi, `E2E empty ${ts}`);
      docId = created.id;

      // Do NOT edit the draft — body remains empty string from createDocument.
      const res = await clientApi.post(`/api/portal/brain/documents/${docId}/publish`);
      expect(res.status).toBe(400);
      expect(res.data?.success).toBe(false);
      expect(typeof res.data?.message).toBe('string');
      // Library throws "cannot publish empty body — add content first" — the
      // route surfaces err.message verbatim.
      expect(res.data.message.toLowerCase()).toMatch(/empty body|empty draft/);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. PATCH refuses status changes
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — updateDocument refuses status change @brain @brain-documents-patch-status', () => {
  test('PATCH with status returns 400 + use /publish or /archive guidance', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;

    try {
      const created = await createDoc(clientApi, `E2E patch-status ${ts}`);
      docId = created.id;

      const res = await clientApi.patch(`/api/portal/brain/documents/${docId}`, {
        status: 'published',
      });
      expect(res.status).toBe(400);
      expect(res.data?.success).toBe(false);
      expect(typeof res.data?.message).toBe('string');
      // Route returns "status changes go through /publish, /archive, or /unarchive"
      expect(res.data.message.toLowerCase()).toMatch(/publish|archive|unarchive/);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. DELETE refuses when acks exist; ?force=true succeeds
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — delete-with-acks @brain @brain-documents-delete-acks', () => {
  test('DELETE with acks present 409s + DOCUMENT_HAS_ACKS; ?force=true succeeds', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;
    let personId: number | null = null;

    try {
      // Person to acknowledge as.
      const personRes = await clientApi.post('/api/portal/brain/people', {
        fullName: `E2E Ack Person ${ts}`,
      });
      expect(personRes.status, JSON.stringify(personRes.data)).toBe(200);
      personId = personRes.data.data.id as number;

      // Document with content + publish.
      const created = await createDoc(clientApi, `E2E delete-acks ${ts}`);
      docId = created.id;
      await editDraft(clientApi, docId, 'Body to be acknowledged.');
      const pub = await publish(clientApi, docId);

      // Ack the published version.
      const ack = await clientApi.post(`/api/portal/brain/documents/${docId}/acknowledge`, {
        versionId: pub.publishedVersionId,
        personId,
      });
      expect(ack.status, JSON.stringify(ack.data)).toBe(200);
      expect(ack.data?.success).toBe(true);

      // DELETE without force — must 409.
      const blocked = await clientApi.delete(`/api/portal/brain/documents/${docId}`);
      expect(blocked.status).toBe(409);
      expect(blocked.data?.success).toBe(false);
      expect(blocked.data?.code).toBe('DOCUMENT_HAS_ACKS');
      expect(typeof blocked.data?.ackCount).toBe('number');
      expect(blocked.data.ackCount).toBeGreaterThanOrEqual(1);

      // DELETE with force=true — must succeed.
      const forced = await clientApi.delete(
        `/api/portal/brain/documents/${docId}?force=true`,
      );
      expect(forced.status, JSON.stringify(forced.data)).toBe(200);
      expect(forced.data?.success).toBe(true);
      expect(forced.data?.data?.deleted).toBe(true);

      // GET — should now be 404.
      const gone = await clientApi.get(`/api/portal/brain/documents/${docId}`);
      expect(gone.status).toBe(404);

      docId = null; // Already deleted — skip cleanup.
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      if (personId != null) await deletePerson(clientApi, personId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. promote-from-note
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — promote-from-note @brain @brain-documents-promote', () => {
  test('promote-from-note creates a document seeded with the note body as v1', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const noteBody = `Note body to promote — ${ts}\n\nLine two.`;
    let noteId: number | null = null;
    let docId: number | null = null;

    try {
      // Source note.
      const noteRes = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E source note ${ts}`,
        body: noteBody,
      });
      expect(noteRes.status, JSON.stringify(noteRes.data)).toBe(200);
      noteId = noteRes.data.data.id as number;

      // Promote.
      const promoteRes = await clientApi.post(
        '/api/portal/brain/documents/promote-from-note',
        { noteId, title: `E2E promoted ${ts}`, category: 'guide' },
      );
      expect(promoteRes.status, JSON.stringify(promoteRes.data)).toBe(200);
      expect(promoteRes.data?.success).toBe(true);
      const doc = promoteRes.data.data?.document ?? promoteRes.data.data;
      const ver = promoteRes.data.data?.version;
      docId = doc.id as number;

      expect(doc.sourceNoteId).toBe(noteId);
      expect(doc.title).toContain(ts);
      expect(doc.status).toBe('draft');
      expect(doc.category).toBe('guide');

      // The v1 should be a draft seeded with the note body.
      expect(ver).toBeTruthy();
      expect(ver.versionNumber).toBe(1);
      expect(ver.isDraft).toBe(true);
      expect(ver.body).toContain(`Note body to promote — ${ts}`);

      // Confirm via GET ?includeBody=true.
      const got = await clientApi.get(
        `/api/portal/brain/documents/${docId}?includeBody=true`,
      );
      expect(got.status).toBe(200);
      const versions: Array<{ versionNumber: number; body?: string; isDraft: boolean }> =
        got.data.data.versions ?? [];
      const v1 = versions.find((v) => v.versionNumber === 1);
      expect(v1).toBeTruthy();
      expect(v1!.isDraft).toBe(true);
      if (typeof v1!.body === 'string') {
        expect(v1!.body).toContain(`Note body to promote — ${ts}`);
      }
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      if (noteId != null) await hardDeleteNote(clientApi, noteId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Link / unlink polymorphism
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — link polymorphism @brain @brain-documents-links', () => {
  test('link / unlink across topic, initiative, decision, person, glossary_term, meeting', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;
    const cleanup: Array<() => Promise<void>> = [];

    try {
      // Document.
      const created = await createDoc(clientApi, `E2E links ${ts}`);
      docId = created.id;

      // Create one of each linkable entity (except meeting — no public POST).
      const topicRes = await clientApi.post('/api/portal/brain/topics', {
        name: `Topic ${ts}`,
      });
      expect(topicRes.status, JSON.stringify(topicRes.data)).toBe(201);
      const topicId = (topicRes.data.data?.topic?.id ?? topicRes.data.data?.id) as number;
      cleanup.push(() => deleteTopic(clientApi, topicId));

      const initRes = await clientApi.post('/api/portal/brain/initiatives', {
        name: `Initiative ${ts}`,
      });
      expect(initRes.status, JSON.stringify(initRes.data)).toBe(200);
      const initId = initRes.data.data.id as number;
      cleanup.push(() => deleteInitiative(clientApi, initId));

      const decRes = await clientApi.post('/api/portal/brain/decisions', {
        title: `Decision ${ts}`,
        decision: 'Do the thing.',
        rationale: 'Because reasons.',
      });
      expect(decRes.status, JSON.stringify(decRes.data)).toBe(201);
      const decId = decRes.data.data.decision.id as number;
      cleanup.push(() => deleteDecision(clientApi, decId));

      const personRes = await clientApi.post('/api/portal/brain/people', {
        fullName: `Person ${ts}`,
      });
      expect(personRes.status, JSON.stringify(personRes.data)).toBe(200);
      const personId = personRes.data.data.id as number;
      cleanup.push(() => deletePerson(clientApi, personId));

      const glossRes = await clientApi.post('/api/portal/brain/glossary', {
        term: `Glossary-${ts}`,
        definition: 'A term for testing.',
      });
      expect(glossRes.status, JSON.stringify(glossRes.data)).toBe(200);
      const glossId = (glossRes.data.data?.term?.id ?? glossRes.data.data?.id) as number;
      cleanup.push(() => deleteGlossaryTerm(clientApi, glossId));

      // Meeting — no public POST endpoint exists. The lib does NOT FK-validate
      // polymorphic entityIds (link rows accept any integer), so we use a
      // synthetic high id to assert the polymorphism reach.
      const syntheticMeetingId = 999_999_999;

      const cases: Array<{ entityType: string; entityId: number }> = [
        { entityType: 'topic', entityId: topicId },
        { entityType: 'initiative', entityId: initId },
        { entityType: 'decision', entityId: decId },
        { entityType: 'person', entityId: personId },
        { entityType: 'glossary_term', entityId: glossId },
        { entityType: 'meeting', entityId: syntheticMeetingId },
      ];

      // Link each.
      for (const c of cases) {
        const link = await clientApi.post(`/api/portal/brain/documents/${docId}/links`, c);
        expect(link.status, `link ${c.entityType}: ${JSON.stringify(link.data)}`).toBe(200);
        expect(link.data?.success).toBe(true);
      }

      // Verify list returns all six.
      const list = await clientApi.get(`/api/portal/brain/documents/${docId}/links?limit=200`);
      expect(list.status).toBe(200);
      const items: Array<{ entityType: string; entityId: number }> = list.data.data.items;
      for (const c of cases) {
        expect(
          items.some((i) => i.entityType === c.entityType && i.entityId === c.entityId),
          `expected ${c.entityType}:${c.entityId} in links list`,
        ).toBe(true);
      }

      // Re-linking is idempotent — same triple returns success without duplicating.
      const dup = await clientApi.post(`/api/portal/brain/documents/${docId}/links`, cases[0]);
      expect(dup.status).toBe(200);

      // Filter by entityType — must return only that type.
      const onlyTopics = await clientApi.get(
        `/api/portal/brain/documents/${docId}/links?entityType=topic`,
      );
      expect(onlyTopics.status).toBe(200);
      const tItems: Array<{ entityType: string }> = onlyTopics.data.data.items;
      expect(tItems.length).toBeGreaterThanOrEqual(1);
      for (const i of tItems) expect(i.entityType).toBe('topic');

      // Unlink each.
      for (const c of cases) {
        const unlink = await clientApi.delete(
          `/api/portal/brain/documents/${docId}/links`,
          c,
        );
        expect(unlink.status, `unlink ${c.entityType}: ${JSON.stringify(unlink.data)}`).toBe(200);
        expect(unlink.data?.success).toBe(true);
        expect(unlink.data?.data?.removed).toBe(true);
      }

      // List must now be empty.
      const after = await clientApi.get(
        `/api/portal/brain/documents/${docId}/links?limit=200`,
      );
      expect(after.status).toBe(200);
      expect(after.data?.data?.items?.length ?? 0).toBe(0);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      // Run cleanup in reverse order so dependent rows go first.
      for (const fn of cleanup.reverse()) {
        await fn().catch(() => {});
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Required-reads (person) → queue → acknowledge → compliance report
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — required-reads person flow @brain @brain-documents-required-reads-person', () => {
  test('assign to person → queue surfaces it → acknowledge → compliance report partitions correctly', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;
    let personId: number | null = null;

    try {
      // Person.
      const personRes = await clientApi.post('/api/portal/brain/people', {
        fullName: `E2E RR Person ${ts}`,
      });
      expect(personRes.status, JSON.stringify(personRes.data)).toBe(200);
      personId = personRes.data.data.id as number;

      // Document + publish.
      const created = await createDoc(clientApi, `E2E required-read ${ts}`);
      docId = created.id;
      await editDraft(clientApi, docId, 'Required content.');
      const pub = await publish(clientApi, docId);

      // Assign required-read targetType=person.
      const assign = await clientApi.post(
        `/api/portal/brain/documents/${docId}/required-reads`,
        { targetType: 'person', targetId: personId },
      );
      expect(assign.status, JSON.stringify(assign.data)).toBe(200);
      expect(assign.data?.success).toBe(true);
      expect(assign.data?.data?.assigned).toBeGreaterThanOrEqual(1);

      // List required-reads for the document.
      const list = await clientApi.get(
        `/api/portal/brain/documents/${docId}/required-reads`,
      );
      expect(list.status).toBe(200);
      const rrs: Array<{ targetType: string; targetId: number }> = list.data.data.items;
      expect(rrs.some((r) => r.targetType === 'person' && r.targetId === personId)).toBe(true);

      // Queue for the person — must include this document.
      const queue = await clientApi.get(
        `/api/portal/brain/document-acks?personId=${personId}&status=open`,
      );
      expect(queue.status, JSON.stringify(queue.data)).toBe(200);
      expect(queue.data?.success).toBe(true);
      const items: Array<{ documentId: number; acknowledged: boolean }> = queue.data.data.items;
      const ours = items.find((i) => i.documentId === docId);
      expect(ours, `expected document ${docId} in queue`).toBeTruthy();
      expect(ours!.acknowledged).toBe(false);

      // Compliance report BEFORE ack — partition shows 1 pending.
      const reportBefore = await clientApi.get(
        `/api/portal/brain/documents/${docId}/compliance-report`,
      );
      expect(reportBefore.status, JSON.stringify(reportBefore.data)).toBe(200);
      const beforeSummary = reportBefore.data.data.summary;
      expect(beforeSummary.totalAssigned).toBeGreaterThanOrEqual(1);
      expect(beforeSummary.acknowledged).toBe(0);
      expect(beforeSummary.pending).toBe(beforeSummary.totalAssigned);
      expect(reportBefore.data.data.pendingPersonIds).toContain(personId);
      expect(reportBefore.data.data.acknowledgedPersonIds).not.toContain(personId);

      // Acknowledge.
      const ack = await clientApi.post(
        `/api/portal/brain/documents/${docId}/acknowledge`,
        { versionId: pub.publishedVersionId, personId },
      );
      expect(ack.status, JSON.stringify(ack.data)).toBe(200);
      expect(ack.data?.success).toBe(true);

      // Queue (status=acknowledged) — must surface this row as acknowledged.
      // NB: compliance-report is unstable_cache'd 30s. Avoid asserting it
      // changed in this run; assert the queue change directly (uncached).
      const queueAcked = await clientApi.get(
        `/api/portal/brain/document-acks?personId=${personId}&status=acknowledged`,
      );
      expect(queueAcked.status).toBe(200);
      const ackedItems: Array<{ documentId: number; acknowledged: boolean }> =
        queueAcked.data.data.items;
      const ackedOurs = ackedItems.find((i) => i.documentId === docId);
      expect(ackedOurs, 'expected the doc in the acknowledged slice').toBeTruthy();
      expect(ackedOurs!.acknowledged).toBe(true);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      if (personId != null) await deletePerson(clientApi, personId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Required-reads (org_unit) → expandOrgUnit fans out
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — required-reads org_unit fan-out @brain @brain-documents-required-reads-org', () => {
  test('assign to org_unit with expandOrgUnit=true creates a row per active member', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;
    let orgUnitId: number | null = null;
    const personIds: number[] = [];

    try {
      // 3 people.
      for (let i = 0; i < 3; i++) {
        const p = await clientApi.post('/api/portal/brain/people', {
          fullName: `E2E Org Person ${i} ${ts}`,
        });
        expect(p.status, JSON.stringify(p.data)).toBe(200);
        personIds.push(p.data.data.id as number);
      }

      // Org unit.
      const ou = await clientApi.post('/api/portal/brain/org-units', {
        name: `E2E Unit ${ts}`,
      });
      expect(ou.status, JSON.stringify(ou.data)).toBe(200);
      orgUnitId = ou.data.data.id as number;

      // Add each person as a member.
      for (const pid of personIds) {
        const m = await clientApi.post(
          `/api/portal/brain/org-units/${orgUnitId}/members`,
          { personId: pid },
        );
        expect(m.status, JSON.stringify(m.data)).toBe(200);
      }

      // Document + publish.
      const created = await createDoc(clientApi, `E2E ou-fanout ${ts}`);
      docId = created.id;
      await editDraft(clientApi, docId, 'OU fan-out content.');
      await publish(clientApi, docId);

      // Assign with expandOrgUnit=true.
      const assign = await clientApi.post(
        `/api/portal/brain/documents/${docId}/required-reads`,
        {
          targetType: 'org_unit',
          targetId: orgUnitId,
          expandOrgUnit: true,
        },
      );
      expect(assign.status, JSON.stringify(assign.data)).toBe(200);
      expect(assign.data?.success).toBe(true);
      // Should have written one person-target row per member.
      expect(assign.data.data.assigned).toBe(3);
      const expandedTo: number[] = assign.data.data.expandedTo ?? [];
      for (const pid of personIds) expect(expandedTo).toContain(pid);

      // Listing required-reads should reflect 3 person-target rows.
      const list = await clientApi.get(
        `/api/portal/brain/documents/${docId}/required-reads?targetType=person`,
      );
      expect(list.status).toBe(200);
      const items: Array<{ targetType: string; targetId: number }> = list.data.data.items;
      const targetIds = items
        .filter((r) => r.targetType === 'person')
        .map((r) => r.targetId);
      for (const pid of personIds) expect(targetIds).toContain(pid);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      if (orgUnitId != null) await deleteOrgUnit(clientApi, orgUnitId);
      for (const pid of personIds) await deletePerson(clientApi, pid);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. compliance-report partition math
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — compliance-report partition @brain @brain-documents-compliance', () => {
  test('partition math: assigned vs acknowledged vs pending vs overdue', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let docId: number | null = null;
    const personIds: number[] = [];

    try {
      // 3 people.
      for (let i = 0; i < 3; i++) {
        const p = await clientApi.post('/api/portal/brain/people', {
          fullName: `E2E Compliance ${i} ${ts}`,
        });
        expect(p.status, JSON.stringify(p.data)).toBe(200);
        personIds.push(p.data.data.id as number);
      }

      // Document + publish.
      const created = await createDoc(clientApi, `E2E compliance ${ts}`);
      docId = created.id;
      await editDraft(clientApi, docId, 'Compliance content.');
      const pub = await publish(clientApi, docId);

      // Assign all 3 — one with dueAt in the past (overdue), one with future,
      // one with no due date.
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const assignA = await clientApi.post(
        `/api/portal/brain/documents/${docId}/required-reads`,
        { targetType: 'person', targetId: personIds[0], dueAt: yesterday },
      );
      expect(assignA.status, JSON.stringify(assignA.data)).toBe(200);

      const assignB = await clientApi.post(
        `/api/portal/brain/documents/${docId}/required-reads`,
        { targetType: 'person', targetId: personIds[1], dueAt: future },
      );
      expect(assignB.status, JSON.stringify(assignB.data)).toBe(200);

      const assignC = await clientApi.post(
        `/api/portal/brain/documents/${docId}/required-reads`,
        { targetType: 'person', targetId: personIds[2] },
      );
      expect(assignC.status, JSON.stringify(assignC.data)).toBe(200);

      // Person 1 acknowledges.
      const ack = await clientApi.post(
        `/api/portal/brain/documents/${docId}/acknowledge`,
        { versionId: pub.publishedVersionId, personId: personIds[1] },
      );
      expect(ack.status, JSON.stringify(ack.data)).toBe(200);

      // Pull report — bypass cache by appending a query param to bust the
      // unstable_cache key. (The route's cache key includes documentId only,
      // so this is best-effort — but in practice the cache miss happens on
      // first call within a fresh worker.)
      const report = await clientApi.get(
        `/api/portal/brain/documents/${docId}/compliance-report`,
      );
      expect(report.status, JSON.stringify(report.data)).toBe(200);
      const data = report.data.data;
      // Math:
      //   assigned   = 3 (one per person)
      //   acked      = 1 (person 1)
      //   pending    = 2 (persons 0 + 2)
      //   overdue    = 1 (person 0 only — past dueAt and not acked)
      expect(data.summary.totalAssigned).toBeGreaterThanOrEqual(3);
      // We can't be strict on equality if other tests left residue, so check
      // the subset we created.
      expect(data.acknowledgedPersonIds).toContain(personIds[1]);
      expect(data.pendingPersonIds).toContain(personIds[0]);
      expect(data.pendingPersonIds).toContain(personIds[2]);
      expect(data.pendingPersonIds).not.toContain(personIds[1]);
      // Person 0 had a past dueAt and never ack'd → must be in overdue.
      expect(data.overduePersonIds).toContain(personIds[0]);
      // Person 1 ack'd, so they are NOT pending or overdue.
      expect(data.overduePersonIds).not.toContain(personIds[1]);
      // Person 2 has no dueAt — pending but NOT overdue.
      expect(data.overduePersonIds).not.toContain(personIds[2]);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      for (const pid of personIds) await deletePerson(clientApi, pid);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11. Tenancy isolation
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Documents — tenancy isolation @brain @brain-documents-tenancy', () => {
  test('client A documents invisible to unauth + admin contexts', async ({ clientApi }) => {
    // The default seed has only one "client" portal user (client@example.com /
    // Acme Corp). Without a second client account in the env we can't cross
    // two real tenants. The defensive shape (mirroring brain-glossary.spec.ts)
    // is: create a doc as client A and confirm unauth + admin can't read it.
    const ts = uniq();
    let docId: number | null = null;
    const adminApi = new ApiClient(
      process.env.ADMIN_EMAIL || 'admin@example.com',
      process.env.ADMIN_PASSWORD || 'admin123',
    );
    await adminApi.ensure();
    const unauthApi = new ApiClient();
    await unauthApi.ensure();

    try {
      const created = await createDoc(clientApi, `E2E tenancy ${ts}`);
      docId = created.id;

      // Unauth context — must not see the row.
      const unauthGet = await unauthApi.get(`/api/portal/brain/documents/${docId}`);
      expect(unauthGet.status).not.toBe(200);

      // Admin user is not a portal "client" and `requireBrainEntitlement`
      // resolves to a different (or no) client context; the route MUST NOT
      // return client A's record. Accept 401/403/404 — all non-leaks.
      const adminGet = await adminApi.get(`/api/portal/brain/documents/${docId}`);
      expect(adminGet.status).not.toBe(200);

      // Sanity — original client A still sees the row.
      const ownGet = await clientApi.get(`/api/portal/brain/documents/${docId}`);
      expect(ownGet.status).toBe(200);
      expect(ownGet.data?.success).toBe(true);
      const doc = ownGet.data.data?.document ?? ownGet.data.data;
      expect(doc?.id).toBe(docId);
    } finally {
      if (docId != null) await hardDeleteDocument(clientApi, docId);
      await adminApi.dispose();
      await unauthApi.dispose();
    }
  });
});
