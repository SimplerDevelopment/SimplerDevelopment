/**
 * LinkedIn publishing channel adapter — tenancy + lifecycle.
 *
 * Covers link/unlink idempotency, cross-tenant refusal, per-user draft
 * listing isolation, and stage sync (scheduled sets scheduledAt, terminal
 * stages are hands-off, unknown cards no-op).
 *
 * Tagged `@publishing @tenancy` so `bun test:tenancy` picks it up.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import {
  getAvailableLinkedinDrafts,
  linkLinkedinDraftToCard,
  syncCardStageToPost,
  unlinkLinkedinDraftFromCard,
  LINKEDIN_ARTIFACT_TYPE,
} from '@/lib/publishing/channels/linkedin';

async function seedDraft(clientId: number, userId: number, text = 'Hello LinkedIn') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.linkedin_posts (client_id, user_id, text)
    VALUES (${clientId}, ${userId}, ${text})
    RETURNING id
  `;
  return row.id;
}

async function seedProject(clientId: number) {
  const sql = getTestSql();
  const [project] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id)
    VALUES ('Publishing', ${clientId})
    RETURNING id
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name)
    VALUES (${project.id}, 'Draft')
    RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title)
    VALUES (${col.id}, ${project.id}, 'Launch post')
    RETURNING id
  `;
  return { projectId: project.id, cardId: card.id };
}

async function artifactCount(cardId: number, postId: number) {
  const sql = getTestSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_artifacts
    WHERE card_id = ${cardId} AND artifact_type = ${LINKEDIN_ARTIFACT_TYPE} AND artifact_id = ${postId}
  `;
  return rows.length;
}

async function draftStatus(postId: number) {
  const sql = getTestSql();
  const [row] = await sql<{ status: string; scheduledAt: Date | null }[]>`
    SELECT status, scheduled_at AS "scheduledAt" FROM ${sql(TEST_SCHEMA)}.linkedin_posts WHERE id = ${postId}
  `;
  return row;
}

describe('LinkedIn channel adapter @publishing @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('li-chan-a');
    B = await sessionForNewClientUser('li-chan-b');
  });

  it('links a draft to a card (artifact row)', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(A.client.id);
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    expect(await artifactCount(cardId, draftId)).toBe(1);
  });

  it('link is idempotent (no duplicate rows)', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(A.client.id);
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    expect(await artifactCount(cardId, draftId)).toBe(1);
  });

  it('refuses a cross-tenant draft (no write)', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(B.client.id);
    await expect(linkLinkedinDraftToCard(cardId, draftId, B.client.id, B.user.id)).rejects.toThrow(
      /does not belong to client/,
    );
    expect(await artifactCount(cardId, draftId)).toBe(0);
  });

  it('unlinks and no-ops when absent', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(A.client.id);
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    await unlinkLinkedinDraftFromCard(cardId, draftId);
    expect(await artifactCount(cardId, draftId)).toBe(0);
    await expect(unlinkLinkedinDraftFromCard(cardId, draftId)).resolves.toBeUndefined();
  });

  it('lists only the caller user drafts (tenancy)', async () => {
    await seedDraft(A.client.id, A.user.id, 'A draft');
    await seedDraft(B.client.id, B.user.id, 'B draft');
    const aDrafts = await getAvailableLinkedinDrafts(A.client.id, A.user.id);
    const bDrafts = await getAvailableLinkedinDrafts(B.client.id, B.user.id);
    expect(aDrafts.map((d) => d.text)).toEqual(['A draft']);
    expect(bDrafts.map((d) => d.text)).toEqual(['B draft']);
  });

  it('syncs scheduled stage onto the draft (status + scheduledAt)', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(A.client.id);
    const sql = getTestSql();
    await sql`UPDATE ${sql(TEST_SCHEMA)}.kanban_cards SET scheduled_for = now() + interval '1 day' WHERE id = ${cardId}`;
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    await syncCardStageToPost(cardId, 'scheduled');
    const row = await draftStatus(draftId);
    expect(row.status).toBe('scheduled');
    expect(row.scheduledAt).not.toBeNull();
  });

  it('sync leaves terminal stages hands-off and unknown cards alone', async () => {
    const draftId = await seedDraft(A.client.id, A.user.id);
    const { cardId } = await seedProject(A.client.id);
    await linkLinkedinDraftToCard(cardId, draftId, A.client.id, A.user.id);
    await syncCardStageToPost(cardId, 'published');
    expect((await draftStatus(draftId)).status).toBe('draft');
    await expect(syncCardStageToPost(999999, 'scheduled')).resolves.toBeUndefined();
  });
});
