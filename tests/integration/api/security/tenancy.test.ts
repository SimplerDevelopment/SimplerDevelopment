/**
 * Cross-tenant isolation regression tests.
 *
 * Each block covers one leak class patched on 2026-04-21. The pattern:
 *   1. Seed data in tenant B
 *   2. Invoke the endpoint with tenant A's session
 *   3. Assert rejection (404 / 403) OR filtered output
 *
 * These are the load-bearing tests for multi-tenancy in the portal. If any go
 * red, the corresponding endpoint has regressed into a cross-tenant leak.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, sessionForStaff, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx) {
  mockedAuth.mockResolvedValue(ctx.session);
}

describe('Tenancy @tenancy @security', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;

  beforeEach(async () => {
    [A, B, staff] = await Promise.all([
      sessionForNewClientUser('tenant-a'),
      sessionForNewClientUser('tenant-b'),
      sessionForStaff('agency'),
    ]);
  });

  // ── Mentionable users: picker must not leak other tenants' users ────────
  describe('GET /api/portal/mentionable-users', () => {
    it('tenant A only sees own members + staff, never B\'s members', async () => {
      await asTenant(A);
      const route = await import('@/app/api/portal/mentionable-users/route');
      const res = await callHandler<{ success: boolean; data: Array<{ id: number; name: string }> }>(
        route as unknown as Record<string, unknown>,
        'GET',
      );

      expect(res.status).toBe(200);
      expect(res.data?.success).toBe(true);
      const ids = new Set(res.data!.data.map(u => u.id));

      expect(ids.has(A.user.id)).toBe(true);         // own user
      expect(ids.has(staff.user.id)).toBe(true);     // agency staff always mentionable
      expect(ids.has(B.user.id)).toBe(false);        // THE leak — must not be present
    });

    it('staff sees themselves + active client members (via cookie context)', async () => {
      // Without an active client cookie, staff fallback returns staff-only. With
      // this helper's setup staff has their own client row so the member is them.
      await asTenant(staff);
      const route = await import('@/app/api/portal/mentionable-users/route');
      const res = await callHandler<{ success: boolean; data: Array<{ id: number }> }>(
        route as unknown as Record<string, unknown>,
        'GET',
      );
      expect(res.status).toBe(200);
      const ids = new Set(res.data!.data.map(u => u.id));
      expect(ids.has(staff.user.id)).toBe(true);
      expect(ids.has(A.user.id)).toBe(false);
      expect(ids.has(B.user.id)).toBe(false);
    });
  });

  // ── Automations logs: ruleId param must not bypass client filter ────────
  describe('GET /api/portal/automations/logs', () => {
    it('tenant A querying tenant B\'s ruleId gets zero logs, not B\'s logs', async () => {
      const sql = getTestSql();
      // Create automation rule + log entry under B's client
      const [ruleB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.automation_rules (client_id, name, enabled, trigger, conditions, actions, created_by)
        VALUES (${B.client.id}, 'B rule', true, ${JSON.stringify({ event: 'test.event' })}::jsonb,
                '[]'::jsonb, '[]'::jsonb, ${B.user.id})
        RETURNING id
      `;
      await sql`
        INSERT INTO ${sql(TEST_SCHEMA)}.automation_logs (client_id, rule_id, trigger_event, trigger_payload, status)
        VALUES (${B.client.id}, ${ruleB.id}, 'test.event', '{}'::jsonb, 'success')
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/automations/logs/route');
      const res = await callHandler<{ success: boolean; logs: Array<{ id: number }> }>(
        route as unknown as Record<string, unknown>,
        'GET',
        { query: { ruleId: ruleB.id } },
      );

      expect(res.status).toBe(200);
      expect(res.data?.success).toBe(true);
      expect(res.data!.logs).toEqual([]);            // must not see B's log
    });
  });

  // ── Card files: PATCH (label a file with a comment) must refuse cross-card / cross-tenant ──
  describe('PATCH /api/portal/cards/[id]/files/[fileId]', () => {
    it('tenant A cannot flip commentId on B\'s card file', async () => {
      const sql = getTestSql();
      // Seed B's project → column → card → file
      const [projB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
        VALUES ('B project', ${B.client.id}, 'active', true, ${B.user.id})
        RETURNING id
      `;
      const [colB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
        VALUES (${projB.id}, 'Todo', 0) RETURNING id
      `;
      const [cardB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
        VALUES (${colB.id}, ${projB.id}, 'B card', 0) RETURNING id
      `;
      const [fileB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_files (card_id, project_id, user_id, original_name, stored_filename, mime_type, file_size, url)
        VALUES (${cardB.id}, ${projB.id}, ${B.user.id}, 'x.png', 'stored.png', 'image/png', 1, 'http://x/y')
        RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'PATCH',
        {
          params: { id: String(cardB.id), fileId: String(fileB.id) },
          body: { commentId: 999 },
        },
      );

      expect(res.status).toBe(404);

      // Verify DB is untouched
      const [check] = await sql<{ comment_id: number | null }[]>`
        SELECT comment_id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileB.id}
      `;
      expect(check.comment_id).toBe(null);
    });
  });

  // ── Card files DELETE: non-staff uploader-only + card-scoping ───────────
  describe('DELETE /api/portal/cards/[id]/files/[fileId]', () => {
    it('tenant A cannot delete B\'s card file via cross-tenant IDs', async () => {
      const sql = getTestSql();
      const [projB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
        VALUES ('B project', ${B.client.id}, 'active', true, ${B.user.id}) RETURNING id
      `;
      const [colB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
        VALUES (${projB.id}, 'Todo', 0) RETURNING id
      `;
      const [cardB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
        VALUES (${colB.id}, ${projB.id}, 'B card', 0) RETURNING id
      `;
      const [fileB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_files (card_id, project_id, user_id, original_name, stored_filename, mime_type, file_size, url)
        VALUES (${cardB.id}, ${projB.id}, ${B.user.id}, 'x.png', 'stored.png', 'image/png', 1, 'http://x/y')
        RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'DELETE',
        { params: { id: String(cardB.id), fileId: String(fileB.id) } },
      );
      expect(res.status).toBe(404);

      const rows = await sql<{ id: number }[]>`
        SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileB.id}
      `;
      expect(rows.length).toBe(1);  // file must still exist
    });
  });

  // ── Card comments DELETE: card-scope + author-only for non-staff ────────
  describe('DELETE /api/portal/cards/[id]/comments/[commentId]', () => {
    it('tenant A cannot delete B\'s card comment via cross-tenant IDs', async () => {
      const sql = getTestSql();
      const [projB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
        VALUES ('B project', ${B.client.id}, 'active', true, ${B.user.id}) RETURNING id
      `;
      const [colB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
        VALUES (${projB.id}, 'Todo', 0) RETURNING id
      `;
      const [cardB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
        VALUES (${colB.id}, ${projB.id}, 'B card', 0) RETURNING id
      `;
      const [commentB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_comments (card_id, user_id, body)
        VALUES (${cardB.id}, ${B.user.id}, 'B comment') RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'DELETE',
        { params: { id: String(cardB.id), commentId: String(commentB.id) } },
      );
      expect(res.status).toBe(404);

      const rows = await sql<{ id: number }[]>`
        SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${commentB.id}
      `;
      expect(rows.length).toBe(1);  // comment preserved
    });
  });

  // ── CRM deal artifacts POST: cross-tenant artifactId must be rejected ───
  describe('POST /api/portal/crm/deals/[id]/artifacts', () => {
    it('tenant A cannot attach B\'s pitch deck to A\'s own deal', async () => {
      const sql = getTestSql();
      // A's pipeline/stage/deal
      const [pipeA] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.crm_pipelines (client_id, name, is_default)
        VALUES (${A.client.id}, 'A pipe', true) RETURNING id
      `;
      const [stageA] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.crm_pipeline_stages (pipeline_id, name, sort_order)
        VALUES (${pipeA.id}, 'New', 0) RETURNING id
      `;
      const [dealA] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.crm_deals (client_id, pipeline_id, stage_id, title)
        VALUES (${A.client.id}, ${pipeA.id}, ${stageA.id}, 'A deal') RETURNING id
      `;
      // B's pitch deck (the forbidden FK target)
      const [deckB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.pitch_decks (client_id, title, slug)
        VALUES (${B.client.id}, 'Secret B deck', ${'b-deck-' + Date.now()}) RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/crm/deals/[id]/artifacts/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'POST',
        {
          params: { id: String(dealA.id) },
          body: { artifactType: 'pitch_deck', artifactId: deckB.id },
        },
      );
      expect(res.status).toBe(404);

      // No artifact row should have been inserted
      const rows = await sql<{ id: number }[]>`
        SELECT id FROM ${sql(TEST_SCHEMA)}.crm_deal_artifacts
        WHERE deal_id = ${dealA.id} AND artifact_id = ${deckB.id}
      `;
      expect(rows.length).toBe(0);
    });
  });

  // ── CRM custom-field values PUT: cross-tenant entityId must be rejected ─
  describe('PUT /api/portal/crm/custom-fields/values', () => {
    it('tenant A cannot write field values against B\'s contact entityId', async () => {
      const sql = getTestSql();
      // A owns a custom field
      const [fieldA] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.crm_custom_fields (client_id, entity_type, field_name, field_type)
        VALUES (${A.client.id}, 'contact', 'favorite_color', 'text') RETURNING id
      `;
      // B owns a contact
      const [contactB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.crm_contacts (client_id, first_name)
        VALUES (${B.client.id}, 'Bob B') RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/crm/custom-fields/values/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'PUT',
        {
          body: {
            entityType: 'contact',
            entityId: contactB.id,
            values: { [String(fieldA.id)]: 'red' },
          },
        },
      );
      expect(res.status).toBe(404);

      // Nothing should have been written
      const rows = await sql<{ id: number }[]>`
        SELECT id FROM ${sql(TEST_SCHEMA)}.crm_custom_field_values
        WHERE entity_id = ${contactB.id} AND entity_type = 'contact'
      `;
      expect(rows.length).toBe(0);
    });
  });

  // ── Branding profile FK: PATCH must refuse cross-tenant profileId ───────
  describe('PATCH /api/portal/websites/[siteId]/branding-profile', () => {
    it('tenant A cannot set their website to use B\'s branding profile', async () => {
      const sql = getTestSql();
      // A's website
      const [siteA] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
        VALUES (${A.client.id}, 'A site', 'a.test') RETURNING id
      `;
      // B's branding profile
      const [profB] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.branding_profiles (client_id, name)
        VALUES (${B.client.id}, 'B profile') RETURNING id
      `;

      await asTenant(A);
      const route = await import('@/app/api/portal/websites/[siteId]/branding-profile/route');
      const res = await callHandler(
        route as unknown as Record<string, unknown>,
        'PATCH',
        { params: { siteId: String(siteA.id) }, body: { brandingProfileId: profB.id } },
      );

      expect(res.status).toBe(404);

      // Verify site was NOT linked
      const [check] = await sql<{ branding_profile_id: number | null }[]>`
        SELECT branding_profile_id FROM ${sql(TEST_SCHEMA)}.client_websites WHERE id = ${siteA.id}
      `;
      expect(check.branding_profile_id).toBe(null);
    });
  });
});
