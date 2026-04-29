import { db } from '@/lib/db';
import {
  brainMeetings,
  brainNotes,
  brainTasks,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
} from '@/lib/db/schema';
import { eq, and, or, desc, sql, ilike } from 'drizzle-orm';

export type BrainSearchEntityType = 'meeting' | 'note' | 'task' | 'relationship';

export interface BrainSearchHit {
  type: BrainSearchEntityType;
  id: number;
  title: string;
  snippet: string;
  /** A normalized score in [0, 1] — used for sorting only. */
  score: number;
  /** Human-readable status string. */
  status?: string;
  /** Date most relevant to the entity for context. */
  occurredAt?: string;
  /** Linked CRM record name when relevant. */
  contextName?: string;
  /** Stable URL within the portal. */
  url: string;
}

export interface BrainSearchResult {
  query: string;
  total: number;
  hits: BrainSearchHit[];
}

interface SearchOpts {
  /** Filter to a subset of entity types. Default: all. */
  types?: BrainSearchEntityType[];
  /** Maximum hits to return across all types. */
  limit?: number;
  /** Per-type cap; combined with `limit` to prevent any one type from drowning others. */
  perTypeLimit?: number;
}

const DEFAULT_PER_TYPE = 10;
const DEFAULT_TOTAL = 25;

/**
 * Keyword search across the brain. Phase 5 MVP — ILIKE only. When pgvector
 * lands (Phase 6) this becomes hybrid (lexical + vector) gated by
 * brain_profiles.embeddingProvider.
 *
 * Always cites by entity type + id + canonical URL so callers (MCP clients,
 * the web "Ask Brain" page) can deep-link results.
 */
export async function searchBrain(
  clientId: number,
  rawQuery: string,
  opts: SearchOpts = {},
): Promise<BrainSearchResult> {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return { query: '', total: 0, hits: [] };
  }

  const types = new Set<BrainSearchEntityType>(opts.types ?? ['meeting', 'note', 'task', 'relationship']);
  const perTypeLimit = Math.max(1, Math.min(opts.perTypeLimit ?? DEFAULT_PER_TYPE, 50));
  const totalLimit = Math.max(1, Math.min(opts.limit ?? DEFAULT_TOTAL, 100));

  // Escape ILIKE meta-characters in the user input.
  const escaped = query.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const lowered = query.toLowerCase();

  const meetingHits: BrainSearchHit[] = [];
  const noteHits: BrainSearchHit[] = [];
  const taskHits: BrainSearchHit[] = [];
  const relationshipHits: BrainSearchHit[] = [];

  await Promise.all([
    types.has('meeting')
      ? db.select({
          id: brainMeetings.id,
          title: brainMeetings.title,
          status: brainMeetings.status,
          aiSummary: brainMeetings.aiSummary,
          humanSummary: brainMeetings.humanSummary,
          transcript: brainMeetings.transcript,
          meetingDate: brainMeetings.meetingDate,
          createdAt: brainMeetings.createdAt,
        }).from(brainMeetings)
          .where(and(
            eq(brainMeetings.clientId, clientId),
            or(
              ilike(brainMeetings.title, pattern),
              ilike(brainMeetings.aiSummary, pattern),
              ilike(brainMeetings.humanSummary, pattern),
              ilike(brainMeetings.transcript, pattern),
            ),
          ))
          .orderBy(desc(brainMeetings.createdAt))
          .limit(perTypeLimit)
          .then((rows) => {
            for (const m of rows) {
              const haystacks: { text: string; weight: number }[] = [
                { text: m.title, weight: 1.0 },
                { text: m.aiSummary ?? '', weight: 0.8 },
                { text: m.humanSummary ?? '', weight: 0.85 },
                { text: m.transcript ?? '', weight: 0.6 },
              ];
              const { snippet, score } = pickSnippet(haystacks, lowered);
              meetingHits.push({
                type: 'meeting',
                id: m.id,
                title: m.title,
                snippet,
                score,
                status: m.status,
                occurredAt: (m.meetingDate ?? m.createdAt).toISOString(),
                url: `/portal/brain/meetings/${m.id}`,
              });
            }
          })
      : Promise.resolve(),

    types.has('note')
      ? db.select({
          id: brainNotes.id,
          title: brainNotes.title,
          body: brainNotes.body,
          tags: brainNotes.tags,
          pinned: brainNotes.pinned,
          confidentialityLevel: brainNotes.confidentialityLevel,
          source: brainNotes.source,
          companyId: brainNotes.companyId,
          dealId: brainNotes.dealId,
          updatedAt: brainNotes.updatedAt,
          createdAt: brainNotes.createdAt,
        }).from(brainNotes)
          .where(and(
            eq(brainNotes.clientId, clientId),
            or(
              ilike(brainNotes.title, pattern),
              ilike(brainNotes.body, pattern),
            ),
          ))
          .orderBy(desc(brainNotes.pinned), desc(brainNotes.updatedAt))
          .limit(perTypeLimit)
          .then(async (rows) => {
            const companyIds = rows.map((r) => r.companyId).filter((v): v is number => v !== null);
            const dealIds = rows.map((r) => r.dealId).filter((v): v is number => v !== null);
            const [coRows, dlRows] = await Promise.all([
              companyIds.length
                ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
                  .where(sql`${crmCompanies.id} IN ${companyIds}`)
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(sql`${crmDeals.id} IN ${dealIds}`)
                : Promise.resolve([] as { id: number; title: string }[]),
            ]);
            const coMap = new Map(coRows.map((c) => [c.id, c.name]));
            const dlMap = new Map(dlRows.map((d) => [d.id, d.title]));

            for (const n of rows) {
              const haystacks = [
                { text: n.title, weight: 1.0 },
                { text: n.body ?? '', weight: 0.7 },
              ];
              const { snippet, score } = pickSnippet(haystacks, lowered);
              // Boost pinned notes a touch so they surface first on ties.
              const finalScore = Math.min(1, score + (n.pinned ? 0.1 : 0));
              const tagList = (n.tags ?? []).slice(0, 3).join(' · ');
              noteHits.push({
                type: 'note',
                id: n.id,
                title: n.title,
                snippet,
                score: finalScore,
                status: tagList || (n.pinned ? 'pinned' : undefined),
                occurredAt: (n.updatedAt ?? n.createdAt).toISOString(),
                contextName: n.companyId !== null
                  ? coMap.get(n.companyId)
                  : n.dealId !== null
                    ? dlMap.get(n.dealId)
                    : undefined,
                url: '/portal/brain/knowledge',
              });
            }
          })
      : Promise.resolve(),

    types.has('task')
      ? db.select({
          id: brainTasks.id,
          title: brainTasks.title,
          description: brainTasks.description,
          status: brainTasks.status,
          priority: brainTasks.priority,
          dueDate: brainTasks.dueDate,
          createdAt: brainTasks.createdAt,
          companyId: brainTasks.companyId,
          dealId: brainTasks.dealId,
        }).from(brainTasks)
          .where(and(
            eq(brainTasks.clientId, clientId),
            or(
              ilike(brainTasks.title, pattern),
              ilike(brainTasks.description, pattern),
            ),
          ))
          .orderBy(desc(brainTasks.createdAt))
          .limit(perTypeLimit)
          .then(async (rows) => {
            // Best-effort linked CRM names for context.
            const companyIds = rows.map((r) => r.companyId).filter((v): v is number => v !== null);
            const dealIds = rows.map((r) => r.dealId).filter((v): v is number => v !== null);
            const [coRows, dlRows] = await Promise.all([
              companyIds.length
                ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
                  .where(sql`${crmCompanies.id} IN ${companyIds}`)
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(sql`${crmDeals.id} IN ${dealIds}`)
                : Promise.resolve([] as { id: number; title: string }[]),
            ]);
            const coMap = new Map(coRows.map((c) => [c.id, c.name]));
            const dlMap = new Map(dlRows.map((d) => [d.id, d.title]));

            for (const t of rows) {
              const haystacks = [
                { text: t.title, weight: 1.0 },
                { text: t.description ?? '', weight: 0.7 },
              ];
              const { snippet, score } = pickSnippet(haystacks, lowered);
              taskHits.push({
                type: 'task',
                id: t.id,
                title: t.title,
                snippet,
                score,
                status: `${t.status} · ${t.priority}`,
                occurredAt: (t.dueDate ?? t.createdAt).toISOString(),
                contextName: t.companyId !== null
                  ? coMap.get(t.companyId)
                  : t.dealId !== null
                    ? dlMap.get(t.dealId)
                    : undefined,
                url: '/portal/brain/tasks',
              });
            }
          })
      : Promise.resolve(),

    types.has('relationship')
      ? db.select({
          id: brainRelationshipOverlays.id,
          relationshipType: brainRelationshipOverlays.relationshipType,
          summary: brainRelationshipOverlays.summary,
          currentPriorities: brainRelationshipOverlays.currentPriorities,
          openLoops: brainRelationshipOverlays.openLoops,
          companyId: brainRelationshipOverlays.companyId,
          dealId: brainRelationshipOverlays.dealId,
          updatedAt: brainRelationshipOverlays.updatedAt,
          priority: brainRelationshipOverlays.priority,
        }).from(brainRelationshipOverlays)
          .where(and(
            eq(brainRelationshipOverlays.clientId, clientId),
            or(
              ilike(brainRelationshipOverlays.summary, pattern),
              ilike(brainRelationshipOverlays.currentPriorities, pattern),
              ilike(brainRelationshipOverlays.openLoops, pattern),
              ilike(brainRelationshipOverlays.relationshipType, pattern),
            ),
          ))
          .orderBy(desc(brainRelationshipOverlays.updatedAt))
          .limit(perTypeLimit)
          .then(async (rows) => {
            const companyIds = rows.map((r) => r.companyId).filter((v): v is number => v !== null);
            const dealIds = rows.map((r) => r.dealId).filter((v): v is number => v !== null);
            const [coRows, dlRows] = await Promise.all([
              companyIds.length
                ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
                  .where(sql`${crmCompanies.id} IN ${companyIds}`)
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(sql`${crmDeals.id} IN ${dealIds}`)
                : Promise.resolve([] as { id: number; title: string }[]),
            ]);
            const coMap = new Map(coRows.map((c) => [c.id, c.name]));
            const dlMap = new Map(dlRows.map((d) => [d.id, d.title]));

            for (const r of rows) {
              const name = r.companyId !== null
                ? coMap.get(r.companyId) ?? `Company #${r.companyId}`
                : r.dealId !== null
                  ? dlMap.get(r.dealId) ?? `Deal #${r.dealId}`
                  : 'Unknown';
              const haystacks = [
                { text: name, weight: 1.0 },
                { text: r.summary ?? '', weight: 0.85 },
                { text: r.currentPriorities ?? '', weight: 0.85 },
                { text: r.openLoops ?? '', weight: 0.8 },
                { text: r.relationshipType, weight: 0.5 },
              ];
              const { snippet, score } = pickSnippet(haystacks, lowered);
              relationshipHits.push({
                type: 'relationship',
                id: r.id,
                title: name,
                snippet,
                score,
                status: `${r.relationshipType} · ${r.priority}`,
                occurredAt: r.updatedAt.toISOString(),
                contextName: r.companyId !== null ? 'company' : 'deal',
                url: `/portal/brain/relationships/${r.id}`,
              });
            }
          })
      : Promise.resolve(),
  ]);

  // Merge + sort by score, then by recency for ties.
  const all = [...meetingHits, ...noteHits, ...taskHits, ...relationshipHits];
  all.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const at = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const bt = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    return bt - at;
  });

  return {
    query,
    total: all.length,
    hits: all.slice(0, totalLimit),
  };
}

const SNIPPET_RADIUS = 80;

/**
 * Pick the highest-scoring haystack that contains the query, weighted by the
 * field's importance (title > summary > body), and produce a context snippet
 * around the match.
 */
function pickSnippet(
  haystacks: { text: string; weight: number }[],
  loweredQuery: string,
): { snippet: string; score: number } {
  let bestSnippet = '';
  let bestScore = 0;

  for (const h of haystacks) {
    if (!h.text) continue;
    const lower = h.text.toLowerCase();
    const idx = lower.indexOf(loweredQuery);
    if (idx === -1) continue;

    // Score: weight × (1 + 0.5 if the match is in the first 100 chars of the field).
    const positionBoost = idx < 100 ? 0.5 : 0;
    const score = h.weight * (1 + positionBoost);

    if (score > bestScore) {
      bestScore = score;
      const start = Math.max(0, idx - SNIPPET_RADIUS);
      const end = Math.min(h.text.length, idx + loweredQuery.length + SNIPPET_RADIUS);
      let snip = h.text.slice(start, end);
      if (start > 0) snip = `…${snip}`;
      if (end < h.text.length) snip = `${snip}…`;
      // Collapse whitespace for readability.
      bestSnippet = snip.replace(/\s+/g, ' ').trim();
    }
  }

  if (bestScore === 0) {
    // Shouldn't happen — query was found by ILIKE — but guard with the title.
    bestSnippet = haystacks[0]?.text?.slice(0, 200) ?? '';
    bestScore = 0.1;
  }

  return { snippet: bestSnippet, score: Math.min(1, bestScore / 1.5) };
}
