// Publishing Command Center — email channel adapter (PUB-9).
//
// Bridges a kanban publishing card to an `email_campaigns` row. Email
// campaigns already have their own scheduling pipeline (status + scheduledAt
// + the existing send worker), so this adapter is a thin translation layer:
//
//   - link/unlink:    insert/delete a `kanban_card_artifacts` row with
//                     artifactType='email_campaign'.
//   - syncCardStage:  mirror the card's publishing stage onto the campaign's
//                     status + scheduledAt. The campaign send worker is the
//                     source of truth for the `published` (= 'sent') flip;
//                     this adapter never writes 'sent'.
//
// Tenancy is enforced on every read/write that touches `email_campaigns` —
// nothing crosses client boundaries.
//
// Adapter shape (`EmailChannelAdapter`) is exported as a single object so
// future callers (board view, schedule worker, MCP layer) can depend on the
// interface, not the bare functions.

import { db } from '@/lib/db';
import {
  emailCampaigns,
  kanbanCardArtifacts,
  kanbanCards,
  projects,
} from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { PublishingStageKey } from '../constants';

/** Stages whose target campaign status, if any, this adapter mirrors. The
 *  worker owns the `draft → scheduled → sending → sent` lifecycle past
 *  `scheduled`; archived/published cards leave the campaign row untouched. */
const STAGE_TO_CAMPAIGN_STATUS: Partial<Record<PublishingStageKey, 'draft' | 'scheduled'>> = {
  idea: 'draft',
  draft: 'draft',
  in_review: 'draft',
  scheduled: 'scheduled',
  // published / archived → intentionally not mapped; the campaign worker /
  // human decides what happens to the campaign row in those terminal states.
};

export interface EmailChannelAdapter {
  linkEmailCampaignToCard(
    cardId: number,
    campaignId: number,
    clientId: number,
    userId: number,
  ): Promise<void>;
  unlinkEmailCampaignFromCard(cardId: number, campaignId: number): Promise<void>;
  syncCardStageToCampaign(cardId: number, stageKey: PublishingStageKey): Promise<void>;
  openInEditorUrl(campaignId: number): string;
  getAvailableEmailCampaigns(
    clientId: number,
  ): Promise<Array<{ id: number; name: string; status: string }>>;
}

/** Link an existing `email_campaigns` row to a publishing kanban card by
 *  inserting a `kanban_card_artifacts` row. Verifies the campaign belongs to
 *  the same client (tenancy guard) BEFORE writing — throws otherwise.
 *
 *  Idempotent: if a row already exists for `(cardId, 'email_campaign',
 *  campaignId)` this function is a no-op and returns normally. */
export async function linkEmailCampaignToCard(
  cardId: number,
  campaignId: number,
  clientId: number,
  userId: number,
): Promise<void> {
  if (!Number.isInteger(cardId) || cardId <= 0) {
    throw new Error('linkEmailCampaignToCard: cardId must be a positive integer');
  }
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error('linkEmailCampaignToCard: campaignId must be a positive integer');
  }
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error('linkEmailCampaignToCard: clientId must be a positive integer');
  }

  const [campaign] = await db
    .select({ id: emailCampaigns.id, name: emailCampaigns.name, clientId: emailCampaigns.clientId })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error(`email campaign ${campaignId} not found`);
  }
  if (campaign.clientId !== clientId) {
    // Tenancy violation — refuse before exposing campaign metadata or
    // writing a cross-tenant artifact link.
    throw new Error(
      `email campaign ${campaignId} does not belong to client ${clientId}`,
    );
  }

  // Idempotency: short-circuit if the same link already exists. We could
  // rely on a uniqueness constraint but the schema doesn't have one today,
  // and a duplicate row would surface as two pinned artifacts in the UI.
  const existing = await db
    .select({ id: kanbanCardArtifacts.id })
    .from(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, 'email_campaign'),
        eq(kanbanCardArtifacts.artifactId, campaignId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(kanbanCardArtifacts).values({
    cardId,
    artifactType: 'email_campaign',
    artifactId: campaignId,
    displayTitle: campaign.name,
    createdBy: userId,
  });
}

/** Remove a card↔campaign link. Idempotent — no-op if the link doesn't
 *  exist. Does NOT touch the underlying campaign row. */
export async function unlinkEmailCampaignFromCard(
  cardId: number,
  campaignId: number,
): Promise<void> {
  if (!Number.isInteger(cardId) || cardId <= 0) {
    throw new Error('unlinkEmailCampaignFromCard: cardId must be a positive integer');
  }
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error('unlinkEmailCampaignFromCard: campaignId must be a positive integer');
  }

  await db
    .delete(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, 'email_campaign'),
        eq(kanbanCardArtifacts.artifactId, campaignId),
      ),
    );
}

/** Mirror a card's publishing stage onto the linked email_campaigns row.
 *
 *   idea / draft / in_review → campaign.status = 'draft'
 *   scheduled                → campaign.status = 'scheduled'
 *                              + campaign.scheduledAt = card.scheduledFor
 *   published / archived     → no change (the send worker / human owns these)
 *
 *  Tenancy: the campaign must share `clientId` with the card's underlying
 *  project (via `kanban_cards → projects.client_id`). We resolve the card's
 *  clientId via a join here rather than asking the caller for it, so the
 *  stage-transition handler only needs `(cardId, stageKey)`.
 *
 *  Idempotent. Silently no-ops if:
 *   - the card has no linked email_campaign artifact
 *   - the linked campaign no longer exists
 *   - the linked campaign belongs to a different client
 *   - the stage is one we don't mirror */
export async function syncCardStageToCampaign(
  cardId: number,
  stageKey: PublishingStageKey,
): Promise<void> {
  const targetStatus = STAGE_TO_CAMPAIGN_STATUS[stageKey];
  if (!targetStatus) return; // published / archived — adapter is hands-off

  if (!Number.isInteger(cardId) || cardId <= 0) {
    throw new Error('syncCardStageToCampaign: cardId must be a positive integer');
  }

  // Pull the card (for scheduledFor + projectId) AND every email_campaign
  // artifact attached to it. A publishing card SHOULD only ever have one
  // linked email_campaign, but the schema permits multiple rows so we sync
  // each one we find.
  const [card] = await db
    .select({
      id: kanbanCards.id,
      projectId: kanbanCards.projectId,
      scheduledFor: kanbanCards.scheduledFor,
    })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  if (!card) return; // card was deleted between transition and adapter call

  const links = await db
    .select({ artifactId: kanbanCardArtifacts.artifactId })
    .from(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, 'email_campaign'),
      ),
    );
  if (links.length === 0) return;

  // Resolve the card's owning client via projects → clients. We hold the
  // clientId out for the tenancy filter on the update below; cards and
  // campaigns must agree.
  const [project] = await db
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, card.projectId))
    .limit(1);
  if (!project) return;

  const campaignIds = links.map((l) => l.artifactId);

  const updateValues: { status: 'draft' | 'scheduled'; scheduledAt?: Date | null; updatedAt: Date } = {
    status: targetStatus,
    updatedAt: new Date(),
  };
  if (targetStatus === 'scheduled') {
    updateValues.scheduledAt = card.scheduledFor ?? null;
  }

  await db
    .update(emailCampaigns)
    .set(updateValues)
    .where(
      and(
        inArray(emailCampaigns.id, campaignIds),
        eq(emailCampaigns.clientId, project.clientId),
      ),
    );
}

/** Deep-link to the campaign editor in the portal. The portal route is
 *  `/portal/email/campaigns/[id]` (the page itself acts as the editor;
 *  there is no separate `/edit` subpath in this codebase). */
export function openInEditorUrl(campaignId: number): string {
  return `/portal/email/campaigns/${campaignId}`;
}

/** Lists draft + scheduled campaigns owned by `clientId`. Used by the
 *  artifact-picker dropdown when a user wants to link an existing campaign
 *  to a publishing card. `sent` and `cancelled` are excluded — you can't
 *  meaningfully attach those to a future-facing publishing card. */
export async function getAvailableEmailCampaigns(
  clientId: number,
): Promise<Array<{ id: number; name: string; status: string }>> {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error('getAvailableEmailCampaigns: clientId must be a positive integer');
  }

  const rows = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      status: emailCampaigns.status,
    })
    .from(emailCampaigns)
    .where(
      and(
        eq(emailCampaigns.clientId, clientId),
        inArray(emailCampaigns.status, ['draft', 'scheduled']),
      ),
    )
    .orderBy(emailCampaigns.id);

  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status }));
}

/** The bundled adapter — depend on this when you need the full surface
 *  (e.g., in the stage-transition handler or the artifact-picker API). */
export const emailChannelAdapter: EmailChannelAdapter = {
  linkEmailCampaignToCard,
  unlinkEmailCampaignFromCard,
  syncCardStageToCampaign,
  openInEditorUrl,
  getAvailableEmailCampaigns,
};
