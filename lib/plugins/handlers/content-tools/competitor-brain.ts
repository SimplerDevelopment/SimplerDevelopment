// Wave 4 — brain ingestion + card-comment loop for competitor-research runs.
//
// After SD's /complete handler persists a `competitor-research` result
// into content_briefs, this module:
//
//   1. Looks up the dedicated `tools-bot@simplerdevelopment.com` user
//      so all auto-authored content has a stable, machine-identifiable
//      author. The lookup is cached for the process lifetime — the row
//      is seeded once via 0118_content_tools_bot_user.sql.
//
//   2. Inserts a `brain_notes` row (client-scoped, tagged
//      `competitor:<slug>` + `monitor:<depth>`, source =
//      'plugin-content-tools') so the long-lived knowledge object
//      lives alongside the rest of the content brain.
//
//   3. For depth='deep' runs, compares meta.vulnerability.score against
//      the most recent prior deep-dive for the same competitor. If the
//      score moved (HIGH↔MED↔LOW), drops a `kanban_card_comments` row
//      on the matching BRAIN card so Jake sees the shift in real-time.
//      "No change" is silent.
//
// Slug → BRAIN card mapping is hardcoded for v1 (4 cards, all in sprint
// 14 of project 141). A `competitor_monitor_config` table would be
// cleaner long-term, but for v1 the map is small and stable — promotion
// to a table is a Wave 6 polish item.
//
// Failure mode: brain ingestion is "secondary value." If the brain_note
// insert or the comment insert throws, the calling /complete handler
// catches the error and logs it BUT still finalizes the run as
// 'succeeded'. The competitor-research output already lives in
// content_briefs; the brain_note + card-comment are reproducible
// signal on top of that.

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { brainNotes } from '@/lib/db/schema/brain';
import { kanbanCardComments } from '@/lib/db/schema/pm';
import { contentBriefs, type CompetitorVulnerability } from '@/lib/db/schema/plugins';

const BOT_EMAIL = 'tools-bot@simplerdevelopment.com';
const BRAIN_NOTE_SOURCE = 'plugin-content-tools';

// In-memory cache; the bot user row is seeded once and never deleted.
let botUserIdCache: number | null | undefined; // undefined = not yet looked up

async function getBotUserId(): Promise<number | null> {
  if (botUserIdCache !== undefined) return botUserIdCache;
  const [row] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, BOT_EMAIL))
    .limit(1);
  botUserIdCache = row ? row.id : null;
  return botUserIdCache;
}

// Test-only reset. Vitest can clear caches between cases.
export function __resetBotUserIdCache(): void {
  botUserIdCache = undefined;
}

// ─── Slug → BRAIN card mapping ────────────────────────────────────────────
// Hardcoded for v1. The cards live in project 141 (BRAIN — Knowledge Curation).
// Verified against production on 2026-05-19.

const COMPETITOR_SLUG_TO_BRAIN_CARD: Record<string, number> = {
  carnegie: 144,        // BRAIN-4 — Pull what matters from Carnegie Higher Ed
  rhb: 146,             // BRAIN-6 — Pull what matters from RHB
  waybetter: 147,       // BRAIN-7 — Pull what matters from Waybetter Marketing
  'human-capital': 148, // BRAIN-8 — Human Capital — competitor, or research source?
};

export function getBrainCardIdForCompetitor(slug: string): number | null {
  return COMPETITOR_SLUG_TO_BRAIN_CARD[slug] ?? null;
}

// ─── Brain-note ingestion ─────────────────────────────────────────────────

export interface IngestBriefAsBrainNoteOpts {
  clientId: number;
  briefId: number;
  competitorSlug: string;
  depth: 'news' | 'deep';
  topic: string;
  body: string;
}

/**
 * Inserts a brain_notes row for a freshly-persisted competitor brief.
 * Returns the new note id, or null if the insert failed (caller logs).
 */
export async function ingestBriefAsBrainNote(
  opts: IngestBriefAsBrainNoteOpts,
): Promise<number | null> {
  const botUserId = await getBotUserId();
  const tagSet = [
    `competitor:${opts.competitorSlug}`,
    `monitor:${opts.depth}`,
  ];
  const title = formatBrainNoteTitle(opts);
  try {
    const [row] = await db.insert(brainNotes).values({
      clientId: opts.clientId,
      title,
      body: opts.body,
      tags: tagSet,
      source: BRAIN_NOTE_SOURCE,
      sourceUrl: `plugin-content-tools://briefs/${opts.briefId}`,
      createdBy: botUserId,
    }).returning({ id: brainNotes.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function formatBrainNoteTitle(
  opts: Pick<IngestBriefAsBrainNoteOpts, 'competitorSlug' | 'depth'>,
): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Competitor monitor: ${opts.competitorSlug} (${opts.depth}) — ${today}`;
}

// ─── Vulnerability-change detection + card comment ────────────────────────

export interface MaybePostScoreChangeCommentOpts {
  clientId: number;
  newBriefId: number;
  competitorSlug: string;
  depth: 'news' | 'deep';
  newVulnerability: CompetitorVulnerability | undefined;
}

export interface ScoreChange {
  fromScore: 'HIGH' | 'MED' | 'LOW' | null; // null = no prior brief
  toScore: 'HIGH' | 'MED' | 'LOW';
}

/**
 * If this is a deep-dive run AND the new vulnerability.score differs from
 * the most recent prior deep-dive for the same competitor, drops a
 * kanban_card_comments row on the matching BRAIN card. Returns the
 * detected change (if any). Silent on "no change" or "no prior brief
 * to compare against" (the first deep-dive seeds the score; no comment).
 *
 * Skips entirely if depth !== 'deep' or vulnerability is missing.
 */
export async function maybePostVulnerabilityChangeComment(
  opts: MaybePostScoreChangeCommentOpts,
): Promise<{ change: ScoreChange; commentId: number } | null> {
  if (opts.depth !== 'deep') return null;
  if (!opts.newVulnerability) return null;

  const cardId = getBrainCardIdForCompetitor(opts.competitorSlug);
  if (cardId == null) return null;

  const prior = await findPreviousDeepDiveVulnerability(
    opts.clientId,
    opts.competitorSlug,
    opts.newBriefId,
  );
  if (!prior) return null; // first deep-dive for this competitor — silent

  if (prior.score === opts.newVulnerability.score) return null;

  const botUserId = await getBotUserId();
  const body = formatScoreChangeCommentBody({
    competitorSlug: opts.competitorSlug,
    fromScore: prior.score,
    toScore: opts.newVulnerability.score,
    rationale: opts.newVulnerability.rationale,
    briefId: opts.newBriefId,
  });

  try {
    const [row] = await db.insert(kanbanCardComments).values({
      cardId,
      userId: botUserId,
      body,
    }).returning({ id: kanbanCardComments.id });
    if (!row) return null;
    return {
      change: { fromScore: prior.score, toScore: opts.newVulnerability.score },
      commentId: row.id,
    };
  } catch {
    return null;
  }
}

/**
 * Finds the meta.vulnerability struct of the most recent prior deep-dive
 * brief for `competitorSlug` (excluding the just-inserted row). Returns
 * null if there's no prior brief, the prior brief has no vulnerability
 * block, or the meta.depth wasn't 'deep'.
 */
async function findPreviousDeepDiveVulnerability(
  clientId: number,
  competitorSlug: string,
  excludeId: number,
): Promise<CompetitorVulnerability | null> {
  const rows = await db
    .select({ meta: contentBriefs.meta, id: contentBriefs.id })
    .from(contentBriefs)
    .where(and(
      eq(contentBriefs.clientId, clientId),
      sql`${contentBriefs.meta}->>'competitorSlug' = ${competitorSlug}`,
      sql`${contentBriefs.meta}->>'depth' = 'deep'`,
      sql`${contentBriefs.id} <> ${excludeId}`,
    ))
    .orderBy(desc(contentBriefs.id))
    .limit(1);
  if (rows.length === 0) return null;
  const meta = rows[0].meta as { vulnerability?: CompetitorVulnerability };
  const vuln = meta?.vulnerability;
  if (!vuln || (vuln.score !== 'HIGH' && vuln.score !== 'MED' && vuln.score !== 'LOW')) {
    return null;
  }
  return vuln;
}

function formatScoreChangeCommentBody(opts: {
  competitorSlug: string;
  fromScore: 'HIGH' | 'MED' | 'LOW';
  toScore: 'HIGH' | 'MED' | 'LOW';
  rationale?: string;
  briefId: number;
}): string {
  const direction = scoreDirection(opts.fromScore, opts.toScore);
  const lines = [
    `**Vulnerability score for ${opts.competitorSlug} changed: ${opts.fromScore} → ${opts.toScore}** (${direction}).`,
    '',
    `Detected by the latest scheduled competitor-research deep-dive (brief #${opts.briefId}).`,
  ];
  if (opts.rationale) {
    lines.push('', '**Why the model scored this differently:**', opts.rationale);
  }
  lines.push('', '_Auto-posted by content-tools-bot. Review the full brief in content-tools → Briefs._');
  return lines.join('\n');
}

function scoreDirection(
  from: 'HIGH' | 'MED' | 'LOW',
  to: 'HIGH' | 'MED' | 'LOW',
): 'more vulnerable' | 'less vulnerable' | 'lateral' {
  const order: Record<'HIGH' | 'MED' | 'LOW', number> = { LOW: 0, MED: 1, HIGH: 2 };
  if (order[to] > order[from]) return 'more vulnerable';
  if (order[to] < order[from]) return 'less vulnerable';
  return 'lateral';
}

// Used by complete.ts to surface a small operational note in the run's
// logTail (helpful when debugging "did anything actually happen after
// the brief landed?").
export interface IngestionSummary {
  brainNoteId: number | null;
  scoreChange: { fromScore: 'HIGH' | 'MED' | 'LOW'; toScore: 'HIGH' | 'MED' | 'LOW' } | null;
  cardCommentId: number | null;
}

export async function ingestCompetitorBriefArtifacts(
  opts: IngestBriefAsBrainNoteOpts & {
    newVulnerability: CompetitorVulnerability | undefined;
  },
): Promise<IngestionSummary> {
  const brainNoteId = await ingestBriefAsBrainNote(opts);
  const commentResult = await maybePostVulnerabilityChangeComment({
    clientId: opts.clientId,
    newBriefId: opts.briefId,
    competitorSlug: opts.competitorSlug,
    depth: opts.depth,
    newVulnerability: opts.newVulnerability,
  });
  return {
    brainNoteId,
    scoreChange: commentResult ? commentResult.change as IngestionSummary['scoreChange'] : null,
    cardCommentId: commentResult?.commentId ?? null,
  };
}
