// Publishing Command Center — LinkedIn channel adapter (Fase 2).
//
// Puente entre una tarjeta publishing y un `linkedin_posts` draft.
// El agente/IA solo crea drafts; el humano pasa a scheduled en la UI y el
// cron existente (`process-linkedin-posts`) publica.
//
//   - link/unlink:    fila `kanban_card_artifacts` con artifactType='linkedin_draft'.
//   - syncCardStage:  espeja stage → linkedin_posts.status + scheduledAt.
//                     published/archived → hands-off (el cron/humano mandan).
//
// Tenancy en cada lectura/escritura sobre `linkedin_posts`.

import { db } from '@/lib/db';
import {
  kanbanCardArtifacts,
  kanbanCards,
  linkedinPosts,
  projects,
} from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { PublishingStageKey } from '../constants';

/** Stages que este adapter espeja. published/archived → hands-off. */
export const LINKEDIN_STAGE_TO_POST_STATUS: Partial<
  Record<PublishingStageKey, 'draft' | 'scheduled'>
> = {
  idea: 'draft',
  draft: 'draft',
  in_review: 'draft',
  scheduled: 'scheduled',
};

export const LINKEDIN_ARTIFACT_TYPE = 'linkedin_draft' as const;

export interface LinkedinChannelAdapter {
  linkLinkedinDraftToCard(cardId: number, postId: number, clientId: number, userId: number): Promise<void>;
  unlinkLinkedinDraftFromCard(cardId: number, postId: number): Promise<void>;
  syncCardStageToPost(cardId: number, stageKey: PublishingStageKey): Promise<void>;
  openInEditorUrl(postId: number): string;
  getAvailableLinkedinDrafts(clientId: number, userId: number): Promise<Array<{ id: number; text: string; status: string }>>;
}

export async function linkLinkedinDraftToCard(
  cardId: number,
  postId: number,
  clientId: number,
  userId: number,
): Promise<void> {
  if (!Number.isInteger(cardId) || cardId <= 0) throw new Error('linkLinkedinDraftToCard: cardId must be a positive integer');
  if (!Number.isInteger(postId) || postId <= 0) throw new Error('linkLinkedinDraftToCard: postId must be a positive integer');
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error('linkLinkedinDraftToCard: clientId must be a positive integer');

  const [post] = await db
    .select({ id: linkedinPosts.id, text: linkedinPosts.text, clientId: linkedinPosts.clientId })
    .from(linkedinPosts)
    .where(eq(linkedinPosts.id, postId))
    .limit(1);
  if (!post) throw new Error(`linkedin draft ${postId} not found`);
  if (post.clientId !== clientId) throw new Error(`linkedin draft ${postId} does not belong to client ${clientId}`);

  const existing = await db
    .select({ id: kanbanCardArtifacts.id })
    .from(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, LINKEDIN_ARTIFACT_TYPE),
        eq(kanbanCardArtifacts.artifactId, postId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(kanbanCardArtifacts).values({
    cardId,
    artifactType: LINKEDIN_ARTIFACT_TYPE,
    artifactId: postId,
    displayTitle: post.text.slice(0, 120) || `LinkedIn draft #${postId}`,
    createdBy: userId,
  });
}

export async function unlinkLinkedinDraftFromCard(cardId: number, postId: number): Promise<void> {
  if (!Number.isInteger(cardId) || cardId <= 0) throw new Error('unlinkLinkedinDraftFromCard: cardId must be a positive integer');
  if (!Number.isInteger(postId) || postId <= 0) throw new Error('unlinkLinkedinDraftFromCard: postId must be a positive integer');
  await db
    .delete(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, LINKEDIN_ARTIFACT_TYPE),
        eq(kanbanCardArtifacts.artifactId, postId),
      ),
    );
}

export async function syncCardStageToPost(cardId: number, stageKey: PublishingStageKey): Promise<void> {
  const targetStatus = LINKEDIN_STAGE_TO_POST_STATUS[stageKey];
  if (!targetStatus) return;
  if (!Number.isInteger(cardId) || cardId <= 0) throw new Error('syncCardStageToPost: cardId must be a positive integer');

  const [card] = await db
    .select({ id: kanbanCards.id, projectId: kanbanCards.projectId, scheduledFor: kanbanCards.scheduledFor })
    .from(kanbanCards)
    .where(eq(kanbanCards.id, cardId))
    .limit(1);
  if (!card) return;

  const links = await db
    .select({ artifactId: kanbanCardArtifacts.artifactId })
    .from(kanbanCardArtifacts)
    .where(
      and(
        eq(kanbanCardArtifacts.cardId, cardId),
        eq(kanbanCardArtifacts.artifactType, LINKEDIN_ARTIFACT_TYPE),
      ),
    );
  if (links.length === 0) return;

  const [project] = await db
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, card.projectId))
    .limit(1);
  if (!project) return;

  const postIds = links.map((l) => l.artifactId);
  const updateValues: { status: 'draft' | 'scheduled'; scheduledAt?: Date | null; updatedAt: Date } = {
    status: targetStatus,
    updatedAt: new Date(),
  };
  if (targetStatus === 'scheduled') {
    updateValues.scheduledAt = card.scheduledFor ?? null;
  }

  await db
    .update(linkedinPosts)
    .set(updateValues)
    .where(
      and(
        inArray(linkedinPosts.id, postIds),
        eq(linkedinPosts.clientId, project.clientId),
        inArray(linkedinPosts.status, ['draft', 'scheduled']),
      ),
    );
}

export function openInEditorUrl(postId: number): string {
  return `/portal/publishing/board?linkedin=${postId}`;
}

export async function getAvailableLinkedinDrafts(
  clientId: number,
  userId: number,
): Promise<Array<{ id: number; text: string; status: string }>> {
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error('getAvailableLinkedinDrafts: clientId must be a positive integer');
  const rows = await db
    .select({ id: linkedinPosts.id, text: linkedinPosts.text, status: linkedinPosts.status })
    .from(linkedinPosts)
    .where(
      and(
        eq(linkedinPosts.clientId, clientId),
        eq(linkedinPosts.userId, userId),
        inArray(linkedinPosts.status, ['draft', 'scheduled']),
      ),
    )
    .orderBy(linkedinPosts.id);
  return rows.map((r) => ({ id: r.id, text: r.text.slice(0, 120), status: r.status }));
}

export const linkedinChannelAdapter: LinkedinChannelAdapter = {
  linkLinkedinDraftToCard,
  unlinkLinkedinDraftFromCard,
  syncCardStageToPost,
  openInEditorUrl,
  getAvailableLinkedinDrafts,
};
