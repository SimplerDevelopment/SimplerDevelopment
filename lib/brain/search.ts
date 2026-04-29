import { db } from '@/lib/db';
import {
  brainMeetings,
  brainNotes,
  brainTasks,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
} from '@/lib/db/schema';
import { eq, and, or, desc, sql, ilike, inArray } from 'drizzle-orm';
import { searchSemantic } from './embeddings';

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
 * Hybrid search across the brain. Lexical (ILIKE) on every entity type and
 * semantic (pgvector cosine ANN) on entity types that have embeddings.
 *
 * Today only `note` has embeddings (KB import populates them). When meeting
 * transcripts and relationship summaries get embedded too, this same
 * function picks them up automatically — the semantic branch already filters
 * by entity_type at the SQL level.
 *
 * If OPENAI_API_KEY isn't configured or the semantic call fails, falls back
 * to lexical-only without breaking the search response.
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
  // Semantic-search-only note hits (populated below alongside the lexical
  // branches). Merged into noteHits after Promise.all completes.
  const semanticNoteHits: BrainSearchHit[] = [];
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

    // Semantic note search. Embeds the query, runs cosine ANN against
    // brain_embeddings, deduplicates per note (keeping the best chunk),
    // joins back to brain_notes for metadata. Wrapped to fail-soft: if
    // OPENAI_API_KEY isn't set or the request fails, returns 0 hits and
    // search degrades gracefully to lexical-only.
    types.has('note') && process.env.OPENAI_API_KEY
      ? runSemanticNoteBranch(clientId, query, perTypeLimit)
          .then((hits) => { for (const h of hits) semanticNoteHits.push(h); })
          .catch(() => { /* fail-soft */ })
      : Promise.resolve(),
  ]);

  // Merge lexical + semantic note hits. For notes that appear in both
  // signals, take the higher score and prefer the lexical snippet (it has
  // the matched keyword in context, which feels better in the UI).
  const mergedNoteHits = mergeNoteHits(noteHits, semanticNoteHits);

  // Merge + sort by score, then by recency for ties.
  const all = [...meetingHits, ...mergedNoteHits, ...taskHits, ...relationshipHits];
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

const SEMANTIC_SNIPPET_RADIUS = 240;

/**
 * Run pgvector cosine ANN against `brain_embeddings` for the given query,
 * dedupe per note (keep the best-similarity chunk), and rebuild
 * BrainSearchHit objects with note metadata. Returns at most `perTypeLimit`
 * hits.
 *
 * The over-fetch factor (`perTypeLimit * 4`) is to give chunk-dedup room —
 * one note can have several chunks in the top-K and we only want one hit
 * per note.
 */
async function runSemanticNoteBranch(
  clientId: number,
  query: string,
  perTypeLimit: number,
): Promise<BrainSearchHit[]> {
  const k = Math.min(perTypeLimit * 4, 200);
  const chunks = await searchSemantic({
    clientId,
    query,
    k,
    entityTypes: ['note'],
  });
  if (chunks.length === 0) return [];

  // Dedupe by entity_id, keep best chunk per note.
  const bestByNote = new Map<number, typeof chunks[0]>();
  for (const c of chunks) {
    const prev = bestByNote.get(c.entityId);
    if (!prev || c.similarity > prev.similarity) bestByNote.set(c.entityId, c);
  }

  // Preserve ranking — order by best similarity per note, then cap.
  const ordered = [...bestByNote.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, perTypeLimit);

  if (ordered.length === 0) return [];

  // Batch-fetch note metadata so we don't N+1 the DB.
  const noteIds = ordered.map(c => c.entityId);
  const notes = await db.select({
    id: brainNotes.id,
    title: brainNotes.title,
    pinned: brainNotes.pinned,
    updatedAt: brainNotes.updatedAt,
    createdAt: brainNotes.createdAt,
    companyId: brainNotes.companyId,
    dealId: brainNotes.dealId,
    tags: brainNotes.tags,
  }).from(brainNotes).where(inArray(brainNotes.id, noteIds));
  const noteById = new Map(notes.map(n => [n.id, n]));

  // Optional: company/deal context names (best-effort, mirrors lexical branch).
  const companyIds = notes.map(n => n.companyId).filter((v): v is number => v !== null);
  const dealIds = notes.map(n => n.dealId).filter((v): v is number => v !== null);
  const [coRows, dlRows] = await Promise.all([
    companyIds.length
      ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
        .where(inArray(crmCompanies.id, companyIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    dealIds.length
      ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
        .where(inArray(crmDeals.id, dealIds))
      : Promise.resolve([] as { id: number; title: string }[]),
  ]);
  const coMap = new Map(coRows.map(c => [c.id, c.name]));
  const dlMap = new Map(dlRows.map(d => [d.id, d.title]));

  const out: BrainSearchHit[] = [];
  for (const chunk of ordered) {
    const note = noteById.get(chunk.entityId);
    if (!note) continue;
    // Trim chunk content to a reasonable snippet width.
    const trimmed = chunk.content.length > SEMANTIC_SNIPPET_RADIUS * 2
      ? chunk.content.slice(0, SEMANTIC_SNIPPET_RADIUS * 2).replace(/\s+/g, ' ').trim() + '…'
      : chunk.content.replace(/\s+/g, ' ').trim();
    out.push({
      type: 'note',
      id: note.id,
      title: note.title,
      snippet: trimmed,
      // Cosine similarity is already in [-1, 1]; pgvector with normalized
      // text embeddings is effectively in [0, 1]. Use directly as score.
      score: chunk.similarity,
      status: note.pinned ? 'pinned' : undefined,
      occurredAt: (note.updatedAt ?? note.createdAt).toISOString(),
      contextName: note.companyId !== null
        ? coMap.get(note.companyId)
        : note.dealId !== null
          ? dlMap.get(note.dealId)
          : undefined,
      url: '/portal/brain/knowledge',
    });
  }
  return out;
}

/**
 * Merge lexical and semantic note hits. For notes appearing in both signals
 * we want to combine their evidence rather than pick one — so the score
 * boosts (additive, capped at 1.0) and we keep the lexical snippet (it
 * shows the matched keyword in context, which the UI's <Highlight>
 * component renders nicely). Notes from semantic-only get their chunk
 * content as the snippet.
 */
function mergeNoteHits(lexical: BrainSearchHit[], semantic: BrainSearchHit[]): BrainSearchHit[] {
  const byId = new Map<number, BrainSearchHit>();
  for (const h of lexical) byId.set(h.id, h);
  for (const sem of semantic) {
    const lex = byId.get(sem.id);
    if (!lex) {
      byId.set(sem.id, sem);
      continue;
    }
    // Combine: keep lexical snippet/title, but boost the score.
    byId.set(sem.id, {
      ...lex,
      score: Math.min(1, lex.score + sem.score * 0.5),
    });
  }
  return [...byId.values()];
}
