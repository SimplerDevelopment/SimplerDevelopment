/**
 * POST /api/portal/cards/[id]/artifacts
 *
 * Contract:
 *   - 401 unauth
 *   - 404 when card does not exist
 *   - 403 client whose tenant does not own the project
 *   - 400 when artifactType / artifactId missing or unknown
 *   - 404 when artifact belongs to another tenant (cross-tenant injection)
 *   - 201 + row inserted with displayTitle resolved from source row
 *
 * The artifacts endpoint is a known cross-tenant attack surface (artifactType +
 * artifactId is a polymorphic FK into 7 different tables — must scope by
 * task's project's clientId).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForStaff,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCard(client: TenantCtx) {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
    VALUES ('Artifact project', ${client.client.id}, 'active', true, ${client.user.id})
    RETURNING id
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  return { projectId: proj.id, cardId: card.id };
}

async function seedDeck(client: TenantCtx, suffix: string) {
  const sql = getTestSql();
  const [deck] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (client_id, title, slug)
    VALUES (${client.client.id}, ${`Deck-${suffix}`}, ${`deck-${suffix}-${Date.now()}-${Math.random()}`})
    RETURNING id
  `;
  return deck.id;
}

describe('POST /api/portal/cards/[id]/artifacts @cards @artifacts', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-artifacts'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    const deckId = await seedDeck(A, 'a1');
    mockedAuth.mockResolvedValue(null);

    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck', artifactId: deckId } },
    );
    expect(res.status).toBe(401);
  });

  it('404 when card does not exist', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '999999999' }, body: { artifactType: 'pitch_deck', artifactId: 1 } },
    );
    expect(res.status).toBe(404);
  });

  it('403 client whose tenant does not own the project', async () => {
    const { cardId } = await seedCard(B);
    const deckId = await seedDeck(B, 'b1');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck', artifactId: deckId } },
    );
    expect(res.status).toBe(403);
  });

  it('400 when artifactType is unknown', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'NOT_REAL', artifactId: 1 } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when artifactId is missing', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck' } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant: A cannot attach B\'s deck to A\'s card', async () => {
    const { cardId } = await seedCard(A);
    const deckBId = await seedDeck(B, 'cross');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck', artifactId: deckBId } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_artifacts
      WHERE card_id = ${cardId} AND artifact_id = ${deckBId} AND artifact_type = 'pitch_deck'
    `;
    expect(rows.length).toBe(0);
  });

  it('201 + row inserted with displayTitle resolved from source', async () => {
    const { cardId } = await seedCard(A);
    const deckId = await seedDeck(A, 'happy');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler<{ success: boolean; data: { id: number; displayTitle: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck', artifactId: deckId } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.displayTitle).toBe('Deck-happy');

    const sql = getTestSql();
    const [row] = await sql<{ artifact_type: string; artifact_id: number; display_title: string; pinned: boolean }[]>`
      SELECT artifact_type, artifact_id, display_title, pinned
      FROM ${sql(TEST_SCHEMA)}.kanban_card_artifacts WHERE card_id = ${cardId}
    `;
    expect(row.artifact_type).toBe('pitch_deck');
    expect(row.artifact_id).toBe(deckId);
    expect(row.display_title).toBe('Deck-happy');
    expect(row.pinned).toBe(false);
  });

  it('staff can attach artifact to any tenant\'s card (staff bypasses client check)', async () => {
    const { cardId } = await seedCard(A);
    const deckId = await seedDeck(A, 'staff-attach');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/artifacts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { artifactType: 'pitch_deck', artifactId: deckId } },
    );
    expect(res.status).toBe(201);
  });
});
