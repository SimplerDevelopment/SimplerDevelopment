/**
 * Brain Glossary — tenant-specific terminology lookup.
 *
 * Flat (no hierarchy) — every term carries:
 *   - `aliases` JSON array of alternate spellings, substring-matched on lookup
 *   - `relatedTermIds` JSON array of "see also" pointers, NOT FK-enforced.
 *     App-layer validates and prunes broken refs (delete cascades through here).
 *
 * Slug is auto-derived from `term` on create (lowercase, alphanumeric,
 * dash-separated). Per-tenant collisions are resolved by appending `-2`, `-3`,
 * etc. The slug is stable — never re-derived on update — because external URLs
 * may reference it.
 *
 * NOTE on audit-in-transaction deadlock: `lib/db` is pinned to `max: 1`, so
 * calling `logAudit` from inside `db.transaction()` deadlocks. All paths here
 * are single-mutation, so we follow Pattern A: do the mutation, then write the
 * audit row outside any transaction. Bulk import writes ONE audit row covering
 * the whole batch.
 */

import { db } from '@/lib/db';
import {
  brainGlossaryTerms,
  type BrainGlossaryStatus,
  type BrainGlossaryTerm,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';

// ─── Types ───────────────────────────────────────────────────────────────────

export type GlossarySource = 'manual' | 'ai_suggested';

/** Slim row returned by listGlossaryTerms by default. */
export interface GlossaryTermRow {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  status: BrainGlossaryStatus;
  category: string | null;
  ownerId: number | null;
  aliasCount: number;
}

export interface ListGlossaryTermsOpts {
  status?: BrainGlossaryStatus;
  category?: string;
  search?: string;
  ownerId?: number;
  limit?: number;
  offset?: number;
}

export interface CreateGlossaryTermInput {
  term: string;
  definition: string;
  shortDefinition?: string | null;
  aliases?: string[];
  status?: BrainGlossaryStatus;
  category?: string | null;
  ownerId?: number | null;
  relatedTermIds?: number[];
  source?: GlossarySource;
  reviewItemId?: number | null;
}

export interface UpdateGlossaryTermInput {
  term?: string;
  definition?: string;
  shortDefinition?: string | null;
  aliases?: string[];
  status?: BrainGlossaryStatus;
  category?: string | null;
  ownerId?: number | null;
  relatedTermIds?: number[];
}

export interface GlossaryRelatedTerm {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
}

export interface GlossaryTermWithRelations {
  term: BrainGlossaryTerm;
  relatedTerms: GlossaryRelatedTerm[];
}

export type GlossaryMatchType =
  | 'exact_term'
  | 'exact_alias'
  | 'term_prefix'
  | 'alias_prefix'
  | 'term_substring'
  | 'alias_substring'
  | 'definition_substring';

export interface GlossaryMatch {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  matchType: GlossaryMatchType;
  score: number;
}

export interface LookupGlossaryResult {
  matches: GlossaryMatch[];
}

export interface BulkImportArgs {
  terms: Array<{
    term: string;
    definition: string;
    shortDefinition?: string | null;
    aliases?: string[];
    category?: string | null;
  }>;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  errors: Array<{ term: string; message: string }>;
}

const BULK_IMPORT_CAP = 200;
const LIST_LIMIT_CAP = 100;
const LOOKUP_LIMIT_CAP = 25;

// ─── Slug helpers ────────────────────────────────────────────────────────────

/** Lowercase, ASCII-alphanumeric, dash-separated. Empty input -> "term". */
function slugifyTerm(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'term';
}

/**
 * Resolve a slug collision by appending `-2`, `-3`, … until a free slot is
 * found within the tenant. Bounded retry loop — in practice 1-3 iterations.
 */
async function nextAvailableSlug(clientId: number, base: string): Promise<string> {
  const existing = await db.select({ slug: brainGlossaryTerms.slug })
    .from(brainGlossaryTerms)
    .where(and(
      eq(brainGlossaryTerms.clientId, clientId),
      sql`${brainGlossaryTerms.slug} = ${base} OR ${brainGlossaryTerms.slug} LIKE ${base + '-%'}`,
    ));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Fall-through safety — extremely unlikely.
  return `${base}-${Date.now()}`;
}

// Exposed for unit testing.
export const __test_slugify = slugifyTerm;

// ─── Pure helper: pruneRelatedTermIds ────────────────────────────────────────

/**
 * Given an array of (id, relatedTermIds) tuples and an id to remove, return
 * only the rows that actually need an update along with the new array.
 * Pure (no DB access) so we can unit-test in isolation.
 */
export function pruneRelatedTermIdsFromList(
  rows: Array<{ id: number; relatedTermIds: number[] }>,
  remove: number,
): Array<{ id: number; relatedTermIds: number[] }> {
  const out: Array<{ id: number; relatedTermIds: number[] }> = [];
  for (const r of rows) {
    if (!Array.isArray(r.relatedTermIds)) continue;
    if (!r.relatedTermIds.includes(remove)) continue;
    out.push({ id: r.id, relatedTermIds: r.relatedTermIds.filter((n) => n !== remove) });
  }
  return out;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listGlossaryTerms(
  clientId: number,
  opts: ListGlossaryTermsOpts = {},
): Promise<{ items: GlossaryTermRow[]; total: number; limit: number; offset: number }> {
  const conds = [eq(brainGlossaryTerms.clientId, clientId)];
  if (opts.status) conds.push(eq(brainGlossaryTerms.status, opts.status));
  if (opts.category) conds.push(eq(brainGlossaryTerms.category, opts.category));
  if (typeof opts.ownerId === 'number') conds.push(eq(brainGlossaryTerms.ownerId, opts.ownerId));
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    // Substring match on term, definition, AND inside any alias element.
    // Outer-table column refs in correlated subqueries must be hard-coded
    // `brain_glossary_terms.aliases` — using `${col}` emits unqualified and
    // would silently match the inner subquery's alias instead.
    conds.push(sql`(
      ${brainGlossaryTerms.term} ILIKE ${q}
      OR ${brainGlossaryTerms.definition} ILIKE ${q}
      OR (
        jsonb_typeof(brain_glossary_terms.aliases::jsonb) = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(brain_glossary_terms.aliases::jsonb) AS a
          WHERE a ILIKE ${q}
        )
      )
    )`);
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 50, LIST_LIMIT_CAP));
  const offset = Math.max(0, opts.offset ?? 0);

  const [items, totalRow] = await Promise.all([
    // We select `aliases` itself (cheap — JSON arrays of short strings) and
    // compute aliasCount in JS rather than via SQL `jsonb_array_length`, which
    // raises if any legacy row holds a scalar JSON value. The list is paged
    // (cap 100) so the JSON payload stays bounded.
    db.select({
      id: brainGlossaryTerms.id,
      term: brainGlossaryTerms.term,
      slug: brainGlossaryTerms.slug,
      shortDefinition: brainGlossaryTerms.shortDefinition,
      status: brainGlossaryTerms.status,
      category: brainGlossaryTerms.category,
      ownerId: brainGlossaryTerms.ownerId,
      aliases: brainGlossaryTerms.aliases,
    })
      .from(brainGlossaryTerms)
      .where(and(...conds))
      .orderBy(asc(sql`lower(${brainGlossaryTerms.term})`))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(brainGlossaryTerms)
      .where(and(...conds)),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      term: r.term,
      slug: r.slug,
      shortDefinition: r.shortDefinition ?? null,
      status: r.status,
      category: r.category ?? null,
      ownerId: r.ownerId ?? null,
      aliasCount: Array.isArray(r.aliases) ? r.aliases.length : 0,
    })),
    total: totalRow[0]?.count ?? 0,
    limit,
    offset,
  };
}

// ─── Get by id ───────────────────────────────────────────────────────────────

export async function getGlossaryTermById(
  clientId: number,
  id: number,
): Promise<GlossaryTermWithRelations | null> {
  const [row] = await db.select().from(brainGlossaryTerms)
    .where(and(eq(brainGlossaryTerms.id, id), eq(brainGlossaryTerms.clientId, clientId)))
    .limit(1);
  if (!row) return null;

  const relatedIds = Array.isArray(row.relatedTermIds) ? row.relatedTermIds.filter((n) => Number.isFinite(n)) : [];
  let relatedTerms: GlossaryRelatedTerm[] = [];
  if (relatedIds.length > 0) {
    // Defensive: filter out cross-tenant ids even if the JSON list is dirty.
    const rows = await db.select({
      id: brainGlossaryTerms.id,
      term: brainGlossaryTerms.term,
      slug: brainGlossaryTerms.slug,
      shortDefinition: brainGlossaryTerms.shortDefinition,
    }).from(brainGlossaryTerms)
      .where(and(
        eq(brainGlossaryTerms.clientId, clientId),
        inArray(brainGlossaryTerms.id, relatedIds),
      ));
    // Preserve the user's authored order from `relatedTermIds`.
    const byId = new Map(rows.map((r) => [r.id, r]));
    relatedTerms = relatedIds
      .map((rid) => byId.get(rid))
      .filter((r): r is { id: number; term: string; slug: string; shortDefinition: string | null } => !!r)
      .map((r) => ({
        id: r.id,
        term: r.term,
        slug: r.slug,
        shortDefinition: r.shortDefinition ?? null,
      }));
  }

  return { term: row, relatedTerms };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createGlossaryTerm(
  clientId: number,
  actorId: number | null,
  input: CreateGlossaryTermInput,
): Promise<BrainGlossaryTerm> {
  const termText = input.term.trim().slice(0, 200);
  if (!termText) throw new Error('term is required');
  const definition = (input.definition ?? '').trim();
  if (!definition) throw new Error('definition is required');

  const baseSlug = slugifyTerm(termText);
  const slug = await nextAvailableSlug(clientId, baseSlug);

  const aliases = Array.isArray(input.aliases)
    ? input.aliases.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim())
    : [];
  const relatedTermIds = Array.isArray(input.relatedTermIds)
    ? input.relatedTermIds.filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const [created] = await db.insert(brainGlossaryTerms).values({
    clientId,
    term: termText,
    slug,
    definition,
    shortDefinition: input.shortDefinition?.trim().slice(0, 500) ?? null,
    aliases,
    status: input.status ?? 'active',
    category: input.category?.trim().slice(0, 100) ?? null,
    ownerId: input.ownerId ?? null,
    relatedTermIds,
    source: input.source ?? 'manual',
    reviewItemId: input.reviewItemId ?? null,
    createdBy: actorId,
  }).returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_glossary.create',
    entityType: 'brain_glossary_term',
    entityId: created.id,
    metadata: { slug: created.slug },
  });

  return created;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateGlossaryTerm(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateGlossaryTermInput,
): Promise<BrainGlossaryTerm | null> {
  const before = await db.select().from(brainGlossaryTerms)
    .where(and(eq(brainGlossaryTerms.id, id), eq(brainGlossaryTerms.clientId, clientId)))
    .limit(1);
  if (!before[0]) return null;

  const set: Partial<typeof brainGlossaryTerms.$inferInsert> = { updatedAt: new Date() };
  // Note: slug is intentionally NOT mutable — stable URLs.
  if (patch.term !== undefined) set.term = patch.term.trim().slice(0, 200);
  if (patch.definition !== undefined) set.definition = patch.definition.trim();
  if (patch.shortDefinition !== undefined) {
    set.shortDefinition = patch.shortDefinition === null
      ? null
      : patch.shortDefinition.trim().slice(0, 500);
  }
  if (patch.aliases !== undefined) {
    set.aliases = patch.aliases.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim());
  }
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.category !== undefined) {
    set.category = patch.category === null ? null : patch.category.trim().slice(0, 100);
  }
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.relatedTermIds !== undefined) {
    set.relatedTermIds = patch.relatedTermIds.filter((n) => Number.isFinite(n) && n > 0);
  }

  const [updated] = await db.update(brainGlossaryTerms).set(set)
    .where(and(eq(brainGlossaryTerms.id, id), eq(brainGlossaryTerms.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_glossary.update',
      entityType: 'brain_glossary_term',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
  }

  return updated ?? null;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Hard delete + prune `relatedTermIds` references from sibling terms.
 * Audit is written BEFORE the delete so the audit row survives even if the
 * delete fails partway. Returns `{ deleted, prunedRelatedTermFromCount }`.
 */
export async function deleteGlossaryTerm(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<{ deleted: boolean; prunedRelatedTermFromCount: number }> {
  const [before] = await db.select().from(brainGlossaryTerms)
    .where(and(eq(brainGlossaryTerms.id, id), eq(brainGlossaryTerms.clientId, clientId)))
    .limit(1);
  if (!before) return { deleted: false, prunedRelatedTermFromCount: 0 };

  // Audit BEFORE the destructive mutation.
  await logAudit({
    clientId,
    actorId,
    action: 'brain_glossary.delete',
    entityType: 'brain_glossary_term',
    entityId: id,
    metadata: { slug: before.slug, term: before.term },
  });

  // Find all other terms that reference this id in their relatedTermIds list.
  // We fetch every (id, relatedTermIds) for the tenant and filter in JS — the
  // glossary is bounded (capped at ~hundreds of terms per tenant in practice)
  // and this avoids JSON predicate fragility around numeric type round-trips
  // and scalar legacy rows. The pure-function diff is unit-tested.
  const allRows = await db.select({
    id: brainGlossaryTerms.id,
    relatedTermIds: brainGlossaryTerms.relatedTermIds,
  }).from(brainGlossaryTerms)
    .where(and(
      eq(brainGlossaryTerms.clientId, clientId),
    ));
  const referrers = allRows.filter((r) => Array.isArray(r.relatedTermIds) && r.relatedTermIds.includes(id));

  const toPrune = pruneRelatedTermIdsFromList(
    referrers.map((r) => ({ id: r.id, relatedTermIds: Array.isArray(r.relatedTermIds) ? r.relatedTermIds : [] })),
    id,
  );

  for (const row of toPrune) {
    await db.update(brainGlossaryTerms)
      .set({ relatedTermIds: row.relatedTermIds, updatedAt: new Date() })
      .where(and(
        eq(brainGlossaryTerms.id, row.id),
        eq(brainGlossaryTerms.clientId, clientId),
      ));
  }

  await db.delete(brainGlossaryTerms)
    .where(and(eq(brainGlossaryTerms.id, id), eq(brainGlossaryTerms.clientId, clientId)));

  return { deleted: true, prunedRelatedTermFromCount: toPrune.length };
}

// ─── Lookup (the marquee MCP tool) ───────────────────────────────────────────

/**
 * Substring + alias-array match against ACTIVE terms only. Returns up to
 * `limit` matches (cap 25, default 10) ranked by score:
 *   10  exact term match (case-insensitive)
 *    8  exact alias match
 *    5  term substring at start
 *    4  alias substring at start
 *    3  term substring anywhere
 *    2  alias substring anywhere
 *    1  definition substring
 */
export async function lookupGlossary(
  clientId: number,
  query: string,
  opts: { limit?: number } = {},
): Promise<LookupGlossaryResult> {
  const q = query?.trim();
  if (!q) return { matches: [] };

  const limit = Math.max(1, Math.min(opts.limit ?? 10, LOOKUP_LIMIT_CAP));

  // Pull a wider candidate set than `limit` so we can sort by score in JS.
  // We bound this at limit * 5 (cap 200) so DB cost stays predictable even
  // for vague short queries that match a lot of definitions.
  const candidateCap = Math.min(limit * 5, 200);
  const like = `%${q}%`;

  const rows = await db.select({
    id: brainGlossaryTerms.id,
    term: brainGlossaryTerms.term,
    slug: brainGlossaryTerms.slug,
    shortDefinition: brainGlossaryTerms.shortDefinition,
    definition: brainGlossaryTerms.definition,
    aliases: brainGlossaryTerms.aliases,
  })
    .from(brainGlossaryTerms)
    .where(and(
      eq(brainGlossaryTerms.clientId, clientId),
      eq(brainGlossaryTerms.status, 'active'),
      sql`(
        ${brainGlossaryTerms.term} ILIKE ${like}
        OR ${brainGlossaryTerms.definition} ILIKE ${like}
        OR (
          jsonb_typeof(brain_glossary_terms.aliases::jsonb) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(brain_glossary_terms.aliases::jsonb) AS a
            WHERE a ILIKE ${like}
          )
        )
      )`,
    ))
    .limit(candidateCap);

  const qLower = q.toLowerCase();
  const matches: GlossaryMatch[] = [];

  for (const r of rows) {
    const termLower = (r.term ?? '').toLowerCase();
    const defLower = (r.definition ?? '').toLowerCase();
    const aliases = Array.isArray(r.aliases) ? r.aliases : [];

    // Score: pick the highest-scoring match for this row.
    let score = 0;
    let matchType: GlossaryMatchType = 'definition_substring';

    if (termLower === qLower) {
      score = 10; matchType = 'exact_term';
    } else if (aliases.some((a) => a.toLowerCase() === qLower)) {
      score = 8; matchType = 'exact_alias';
    } else if (termLower.startsWith(qLower)) {
      score = 5; matchType = 'term_prefix';
    } else if (aliases.some((a) => a.toLowerCase().startsWith(qLower))) {
      score = 4; matchType = 'alias_prefix';
    } else if (termLower.includes(qLower)) {
      score = 3; matchType = 'term_substring';
    } else if (aliases.some((a) => a.toLowerCase().includes(qLower))) {
      score = 2; matchType = 'alias_substring';
    } else if (defLower.includes(qLower)) {
      score = 1; matchType = 'definition_substring';
    } else {
      continue; // DB query was permissive — skip rows with no real match.
    }

    matches.push({
      id: r.id,
      term: r.term,
      slug: r.slug,
      shortDefinition: r.shortDefinition ?? null,
      matchType,
      score,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable secondary sort by term length (shorter first) then term.
    if (a.term.length !== b.term.length) return a.term.length - b.term.length;
    return a.term.localeCompare(b.term);
  });

  return { matches: matches.slice(0, limit) };
}

// ─── Bulk import ─────────────────────────────────────────────────────────────

/**
 * Bulk insert with ON CONFLICT (client_id, slug) DO UPDATE. Each item is
 * processed independently — if one slug fails (e.g. mid-batch DB error), the
 * row is recorded in `errors` and the loop continues. Cap input length at 200.
 * One audit row is written AFTER the batch completes (action
 * `brain_glossary.bulk_import`, metadata.count).
 */
export async function bulkImportGlossary(
  clientId: number,
  actorId: number | null,
  args: BulkImportArgs,
): Promise<BulkImportResult> {
  if (!Array.isArray(args.terms)) {
    throw new Error('terms must be an array');
  }
  if (args.terms.length > BULK_IMPORT_CAP) {
    throw new Error(`Bulk import is capped at ${BULK_IMPORT_CAP} terms per call (got ${args.terms.length})`);
  }

  const result: BulkImportResult = { created: 0, updated: 0, errors: [] };

  // Pre-compute slugs and dedupe within the batch — last-write-wins per slug
  // within the batch matches the ON CONFLICT semantics at the DB layer.
  const slugSeen = new Map<string, number>(); // slug -> index in args.terms
  const items: Array<{ idx: number; term: string; slug: string; def: string; shortDef: string | null; aliases: string[]; category: string | null }> = [];
  for (let i = 0; i < args.terms.length; i++) {
    const raw = args.terms[i];
    try {
      if (!raw || typeof raw !== 'object') {
        result.errors.push({ term: '<invalid>', message: 'item must be an object' });
        continue;
      }
      const termText = typeof raw.term === 'string' ? raw.term.trim().slice(0, 200) : '';
      const definition = typeof raw.definition === 'string' ? raw.definition.trim() : '';
      if (!termText) { result.errors.push({ term: String(raw.term ?? ''), message: 'term is required' }); continue; }
      if (!definition) { result.errors.push({ term: termText, message: 'definition is required' }); continue; }
      const slug = slugifyTerm(termText);
      slugSeen.set(slug, i);
      items.push({
        idx: i,
        term: termText,
        slug,
        def: definition,
        shortDef: typeof raw.shortDefinition === 'string' ? raw.shortDefinition.trim().slice(0, 500) : null,
        aliases: Array.isArray(raw.aliases)
          ? raw.aliases.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map((a) => a.trim())
          : [],
        category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 100) : null,
      });
    } catch (e) {
      result.errors.push({ term: String(raw?.term ?? ''), message: e instanceof Error ? e.message : 'invalid item' });
    }
  }

  // Pre-read the set of slugs that already exist for this tenant so we can
  // accurately classify each row as `created` vs `updated`. Compared to
  // relying on `createdAt vs updatedAt` after an upsert, this is robust to
  // clock skew and re-imports within the same second.
  const incomingSlugs = items.map((it) => it.slug);
  const existing = incomingSlugs.length > 0
    ? await db.select({ slug: brainGlossaryTerms.slug }).from(brainGlossaryTerms)
        .where(and(
          eq(brainGlossaryTerms.clientId, clientId),
          inArray(brainGlossaryTerms.slug, incomingSlugs),
        ))
    : [];
  const existingSlugs = new Set(existing.map((r) => r.slug));

  // Process one row at a time so a single bad row doesn't poison the whole
  // batch. ON CONFLICT lets us update-on-collision atomically per row.
  for (const it of items) {
    try {
      await db.insert(brainGlossaryTerms).values({
        clientId,
        term: it.term,
        slug: it.slug,
        definition: it.def,
        shortDefinition: it.shortDef,
        aliases: it.aliases,
        status: 'active',
        category: it.category,
        relatedTermIds: [],
        source: 'manual',
        createdBy: actorId,
      })
        .onConflictDoUpdate({
          target: [brainGlossaryTerms.clientId, brainGlossaryTerms.slug],
          set: {
            term: it.term,
            definition: it.def,
            shortDefinition: it.shortDef,
            aliases: it.aliases,
            category: it.category,
            updatedAt: new Date(),
          },
        });
      if (existingSlugs.has(it.slug)) {
        result.updated++;
      } else {
        result.created++;
        // First-pass duplicate-slug-within-batch handling: treat the first as
        // created, subsequent ones as updated.
        existingSlugs.add(it.slug);
      }
    } catch (e) {
      result.errors.push({ term: it.term, message: e instanceof Error ? e.message : 'insert failed' });
    }
  }

  // One audit row covering the whole batch — Pattern A (audit AFTER mutation).
  await logAudit({
    clientId,
    actorId,
    action: 'brain_glossary.bulk_import',
    entityType: 'brain_glossary_term',
    metadata: {
      count: args.terms.length,
      created: result.created,
      updated: result.updated,
      errors: result.errors.length,
    },
  });

  return result;
}
