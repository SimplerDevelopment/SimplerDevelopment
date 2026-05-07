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

export type BrainSearchEntityType =
  | 'meeting'
  | 'note'
  | 'task'
  | 'relationship'
  | 'company'
  | 'contact'
  | 'deal'
  | 'post';

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

  const types = new Set<BrainSearchEntityType>(opts.types ?? [
    'meeting', 'note', 'task', 'relationship', 'company', 'contact', 'deal', 'post',
  ]);
  const perTypeLimit = Math.max(1, Math.min(opts.perTypeLimit ?? DEFAULT_PER_TYPE, 50));
  const totalLimit = Math.max(1, Math.min(opts.limit ?? DEFAULT_TOTAL, 100));

  // Escape ILIKE meta-characters in the user input.
  const escaped = query.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const lowered = query.toLowerCase();

  const meetingHits: BrainSearchHit[] = [];
  const noteHits: BrainSearchHit[] = [];
  // Semantic-search hits across every embedded entity type. Populated
  // below alongside the lexical branches. Notes get merged with their
  // lexical counterparts; other types ride along semantic-only.
  const semanticHits: BrainSearchHit[] = [];
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
                url: `/portal/brain/communications/${m.id}`,
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
                  .where(and(sql`${crmCompanies.id} IN ${companyIds}`, eq(crmCompanies.clientId, clientId)))
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(and(sql`${crmDeals.id} IN ${dealIds}`, eq(crmDeals.clientId, clientId)))
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
                  .where(and(sql`${crmCompanies.id} IN ${companyIds}`, eq(crmCompanies.clientId, clientId)))
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(and(sql`${crmDeals.id} IN ${dealIds}`, eq(crmDeals.clientId, clientId)))
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
                  .where(and(sql`${crmCompanies.id} IN ${companyIds}`, eq(crmCompanies.clientId, clientId)))
                : Promise.resolve([] as { id: number; name: string }[]),
              dealIds.length
                ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
                  .where(and(sql`${crmDeals.id} IN ${dealIds}`, eq(crmDeals.clientId, clientId)))
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

    // Semantic search across every embedded entity type the caller asked
    // for. Single OpenAI roundtrip embeds the query; one cosine ANN scan
    // returns top-K chunks across all types; we then dedupe per entity
    // and look up display metadata. Wrapped to fail-soft.
    process.env.OPENAI_API_KEY
      ? runSemanticBranch(clientId, query, [...types], perTypeLimit)
          .then((hits) => { for (const h of hits) semanticHits.push(h); })
          .catch(() => { /* fail-soft */ })
      : Promise.resolve(),
  ]);

  // Split semantic hits by entity type — notes get merged with their
  // lexical counterparts (both signals contribute), other types ride
  // along with semantic-only scoring.
  const semanticByType = new Map<BrainSearchEntityType, BrainSearchHit[]>();
  for (const h of semanticHits) {
    const list = semanticByType.get(h.type) ?? [];
    list.push(h);
    semanticByType.set(h.type, list);
  }
  const mergedNoteHits = mergeNoteHits(noteHits, semanticByType.get('note') ?? []);

  // Merge + sort by score, then by recency for ties.
  const all = [
    ...meetingHits,
    ...mergedNoteHits,
    ...taskHits,
    ...relationshipHits,
    // Semantic-only entity types (no lexical counterpart yet).
    ...(semanticByType.get('company') ?? []),
    ...(semanticByType.get('contact') ?? []),
    ...(semanticByType.get('deal') ?? []),
    ...(semanticByType.get('post') ?? []),
  ];
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
async function runSemanticBranch(
  clientId: number,
  query: string,
  entityTypes: BrainSearchEntityType[],
  perTypeLimit: number,
): Promise<BrainSearchHit[]> {
  if (entityTypes.length === 0) return [];
  // Over-fetch: a single entity can occupy several chunks in the top-K, and
  // we want at least perTypeLimit *unique entities per type* in the result.
  const k = Math.min(perTypeLimit * entityTypes.length * 4, 400);
  const chunks = await searchSemantic({
    clientId,
    query,
    k,
    entityTypes,
  });
  if (chunks.length === 0) return [];

  // Dedupe by (entity_type, entity_id), keep best chunk per entity.
  const bestByEntity = new Map<string, typeof chunks[0]>();
  for (const c of chunks) {
    const key = `${c.entityType}:${c.entityId}`;
    const prev = bestByEntity.get(key);
    if (!prev || c.similarity > prev.similarity) bestByEntity.set(key, c);
  }

  // Group dedup'd entities by type, capped to perTypeLimit each.
  const idsByType: Record<string, number[]> = {};
  const chunksByEntity = new Map<string, typeof chunks[0]>();
  const grouped = [...bestByEntity.values()].sort((a, b) => b.similarity - a.similarity);
  const seenPerType: Record<string, number> = {};
  for (const c of grouped) {
    const t = c.entityType;
    seenPerType[t] = (seenPerType[t] ?? 0) + 1;
    if (seenPerType[t] > perTypeLimit) continue;
    (idsByType[t] ??= []).push(c.entityId);
    chunksByEntity.set(`${t}:${c.entityId}`, c);
  }

  // Batch-fetch metadata per type so we don't N+1.
  const out: BrainSearchHit[] = [];

  if (idsByType.note?.length) {
    const rows = await db.select({
      id: brainNotes.id, title: brainNotes.title, pinned: brainNotes.pinned,
      updatedAt: brainNotes.updatedAt, createdAt: brainNotes.createdAt,
      companyId: brainNotes.companyId, dealId: brainNotes.dealId,
    }).from(brainNotes).where(inArray(brainNotes.id, idsByType.note));
    for (const r of rows) {
      const c = chunksByEntity.get(`note:${r.id}`); if (!c) continue;
      out.push({
        type: 'note', id: r.id, title: r.title, snippet: trimChunk(c.content),
        score: c.similarity, status: r.pinned ? 'pinned' : undefined,
        occurredAt: (r.updatedAt ?? r.createdAt).toISOString(),
        url: '/portal/brain/knowledge',
      });
    }
  }

  if (idsByType.meeting?.length) {
    const rows = await db.select({
      id: brainMeetings.id, title: brainMeetings.title, status: brainMeetings.status,
      meetingDate: brainMeetings.meetingDate, createdAt: brainMeetings.createdAt,
    }).from(brainMeetings).where(inArray(brainMeetings.id, idsByType.meeting));
    for (const r of rows) {
      const c = chunksByEntity.get(`meeting:${r.id}`); if (!c) continue;
      out.push({
        type: 'meeting', id: r.id, title: r.title, snippet: trimChunk(c.content),
        score: c.similarity, status: r.status,
        occurredAt: (r.meetingDate ?? r.createdAt).toISOString(),
        url: `/portal/brain/communications/${r.id}`,
      });
    }
  }

  if (idsByType.relationship?.length) {
    const rows = await db.select({
      id: brainRelationshipOverlays.id,
      relationshipType: brainRelationshipOverlays.relationshipType,
      priority: brainRelationshipOverlays.priority,
      updatedAt: brainRelationshipOverlays.updatedAt,
      companyId: brainRelationshipOverlays.companyId,
      dealId: brainRelationshipOverlays.dealId,
    }).from(brainRelationshipOverlays).where(inArray(brainRelationshipOverlays.id, idsByType.relationship));
    for (const r of rows) {
      const c = chunksByEntity.get(`relationship:${r.id}`); if (!c) continue;
      out.push({
        type: 'relationship', id: r.id, title: r.relationshipType, snippet: trimChunk(c.content),
        score: c.similarity, status: r.priority,
        occurredAt: r.updatedAt.toISOString(),
        contextName: r.companyId !== null ? 'company' : r.dealId !== null ? 'deal' : undefined,
        url: `/portal/brain/relationships/${r.id}`,
      });
    }
  }

  if (idsByType.task?.length) {
    const rows = await db.select({
      id: brainTasks.id, title: brainTasks.title, status: brainTasks.status,
      priority: brainTasks.priority, dueDate: brainTasks.dueDate, createdAt: brainTasks.createdAt,
    }).from(brainTasks).where(inArray(brainTasks.id, idsByType.task));
    for (const r of rows) {
      const c = chunksByEntity.get(`task:${r.id}`); if (!c) continue;
      out.push({
        type: 'task', id: r.id, title: r.title, snippet: trimChunk(c.content),
        score: c.similarity, status: `${r.status} · ${r.priority}`,
        occurredAt: (r.dueDate ?? r.createdAt).toISOString(),
        url: '/portal/brain/tasks',
      });
    }
  }

  if (idsByType.company?.length) {
    const rows = await db.select({
      id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry,
      updatedAt: crmCompanies.updatedAt, createdAt: crmCompanies.createdAt,
    }).from(crmCompanies).where(inArray(crmCompanies.id, idsByType.company));
    for (const r of rows) {
      const c = chunksByEntity.get(`company:${r.id}`); if (!c) continue;
      out.push({
        type: 'company', id: r.id, title: r.name, snippet: trimChunk(c.content),
        score: c.similarity, status: r.industry ?? undefined,
        occurredAt: (r.updatedAt ?? r.createdAt).toISOString(),
        url: `/portal/crm/companies/${r.id}`,
      });
    }
  }

  if (idsByType.contact?.length) {
    const rows = await db.execute<{
      id: number; first_name: string; last_name: string | null; title: string | null;
      updated_at: Date; company_name: string | null;
    }>(sql`
      SELECT c.id, c.first_name, c.last_name, c.title, c.updated_at, co.name AS company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies co ON co.id = c.company_id
      WHERE c.id IN ${idsByType.contact}
    `);
    for (const r of rows as unknown as Array<{ id: number; first_name: string; last_name: string | null; title: string | null; updated_at: Date; company_name: string | null; }>) {
      const ck = chunksByEntity.get(`contact:${r.id}`); if (!ck) continue;
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      out.push({
        type: 'contact', id: r.id, title: fullName, snippet: trimChunk(ck.content),
        score: ck.similarity, status: r.title ?? undefined,
        occurredAt: new Date(r.updated_at).toISOString(),
        contextName: r.company_name ?? undefined,
        url: `/portal/crm/contacts/${r.id}`,
      });
    }
  }

  if (idsByType.deal?.length) {
    const rows = await db.execute<{
      id: number; title: string; status: string; updated_at: Date; company_name: string | null;
    }>(sql`
      SELECT d.id, d.title, d.status, d.updated_at, co.name AS company_name
      FROM crm_deals d
      LEFT JOIN crm_companies co ON co.id = d.company_id
      WHERE d.id IN ${idsByType.deal}
    `);
    for (const r of rows as unknown as Array<{ id: number; title: string; status: string; updated_at: Date; company_name: string | null; }>) {
      const ck = chunksByEntity.get(`deal:${r.id}`); if (!ck) continue;
      out.push({
        type: 'deal', id: r.id, title: r.title, snippet: trimChunk(ck.content),
        score: ck.similarity, status: r.status,
        occurredAt: new Date(r.updated_at).toISOString(),
        contextName: r.company_name ?? undefined,
        url: '/portal/crm/deals',
      });
    }
  }

  if (idsByType.post?.length) {
    const rows = await db.execute<{
      id: number; title: string; updated_at: Date; website_id: number | null;
    }>(sql`
      SELECT id, title, updated_at, website_id
      FROM posts WHERE id IN ${idsByType.post}
    `);
    for (const r of rows as unknown as Array<{ id: number; title: string; updated_at: Date; website_id: number | null }>) {
      const ck = chunksByEntity.get(`post:${r.id}`); if (!ck) continue;
      out.push({
        type: 'post', id: r.id, title: r.title, snippet: trimChunk(ck.content),
        score: ck.similarity,
        occurredAt: new Date(r.updated_at).toISOString(),
        url: r.website_id
          ? `/portal/websites/${r.website_id}/posts/${r.id}/edit`
          : '/portal/posts',
      });
    }
  }

  return out;
}

/** Trim chunk content to a snippet length and collapse whitespace. */
function trimChunk(content: string): string {
  if (content.length > SEMANTIC_SNIPPET_RADIUS * 2) {
    return content.slice(0, SEMANTIC_SNIPPET_RADIUS * 2).replace(/\s+/g, ' ').trim() + '…';
  }
  return content.replace(/\s+/g, ' ').trim();
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
