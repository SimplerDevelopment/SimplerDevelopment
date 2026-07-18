/**
 * Dataview — Obsidian-style live queries embedded in brain notes.
 *
 * Differentiator vs. Obsidian: queries cross-entity data (CRM, deals, contacts,
 * posts, meetings, brain notes/tasks) — not just markdown frontmatter. A fenced
 * ` ```dataview ` JSON block in any markdown body becomes a live table.
 *
 * Security model:
 *  - Every query is hard-scoped to `clientId` server-side. Caller cannot opt out.
 *  - `type` must be in TYPE_REGISTRY (rejected with 400 otherwise).
 *  - Filter / sort / column keys must be in the per-type allowlist (no arbitrary
 *    column references — prevents trivial info-leak via filter on a hidden column
 *    or "ORDER BY (subquery)" tricks).
 *  - Limit clamped to MAX_LIMIT.
 *  - `posts` is special — joined via `client_websites.clientId` because
 *    `posts.clientId` doesn't exist in this schema.
 */

import { db } from '@/lib/db';
import {
  brainNotes,
  brainMeetings,
  brainTasks,
  crmCompanies,
  crmContacts,
  crmDeals,
  posts,
  clientWebsites,
} from '@/lib/db/schema';
import { and, asc, desc, eq, gt, ilike, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export const MAX_LIMIT = 50;

export type DataviewFilterValue =
  | string
  | number
  | boolean
  | null
  | { op: 'in'; value: (string | number)[] }
  | { op: 'gt' | 'lt'; value: string | number }
  | { op: 'like'; value: string };

export interface DataviewQuery {
  type: string;
  filter?: Record<string, DataviewFilterValue>;
  sort?: string;
  limit?: number;
  columns?: string[];
}

export interface DataviewResult {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

/**
 * Per-type contract:
 *   columns        — every column the renderer is allowed to project. The
 *                    response always returns this superset (or the user's
 *                    requested subset); never an "expanded *".
 *   filterable     — keys allowed in `filter`. Subset of columns + meta keys.
 *   sortable       — keys allowed in `sort`.
 *   defaultSort    — applied when caller omits `sort`.
 */
interface TypeSpec {
  columns: string[];
  filterable: Set<string>;
  sortable: Set<string>;
  defaultSort: { col: string; dir: 'asc' | 'desc' };
}

const NOTE_COLS = ['id', 'title', 'tags', 'pinned', 'sourceUrl', 'updatedAt', 'createdAt'];
const MEETING_COLS = ['id', 'title', 'status', 'meetingDate', 'updatedAt', 'createdAt'];
const TASK_COLS = ['id', 'title', 'status', 'priority', 'dueDate', 'updatedAt', 'createdAt'];
const COMPANY_COLS = ['id', 'name', 'domain', 'industry', 'size', 'updatedAt', 'createdAt'];
const CONTACT_COLS = ['id', 'name', 'email', 'title', 'company', 'status', 'updatedAt', 'createdAt'];
const DEAL_COLS = ['id', 'title', 'status', 'priority', 'value', 'company', 'updatedAt', 'createdAt'];
const POST_COLS = ['id', 'title', 'slug', 'published', 'postType', 'updatedAt', 'createdAt'];

const TYPE_REGISTRY: Record<string, TypeSpec> = {
  notes: {
    columns: NOTE_COLS,
    filterable: new Set([...NOTE_COLS, 'companyId', 'dealId', 'contactId', 'meetingId']),
    sortable: new Set(NOTE_COLS),
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
  meetings: {
    columns: MEETING_COLS,
    filterable: new Set([...MEETING_COLS, 'companyId', 'dealId']),
    sortable: new Set(MEETING_COLS),
    defaultSort: { col: 'meetingDate', dir: 'desc' },
  },
  tasks: {
    columns: TASK_COLS,
    filterable: new Set([...TASK_COLS, 'ownerId', 'meetingId', 'companyId', 'dealId']),
    sortable: new Set(TASK_COLS),
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
  companies: {
    columns: COMPANY_COLS,
    filterable: new Set(COMPANY_COLS),
    sortable: new Set(COMPANY_COLS),
    defaultSort: { col: 'name', dir: 'asc' },
  },
  contacts: {
    columns: CONTACT_COLS,
    filterable: new Set([...CONTACT_COLS, 'companyId', 'firstName', 'lastName']),
    sortable: new Set(CONTACT_COLS),
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
  deals: {
    columns: DEAL_COLS,
    filterable: new Set([...DEAL_COLS, 'companyId', 'contactId', 'pipelineId', 'stageId', 'ownerId']),
    sortable: new Set(DEAL_COLS),
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
  posts: {
    columns: POST_COLS,
    filterable: new Set([...POST_COLS, 'websiteId']),
    sortable: new Set(POST_COLS),
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
};

export class DataviewError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'DataviewError';
  }
}

export function listSupportedTypes(): string[] {
  return Object.keys(TYPE_REGISTRY);
}

/** Validate + normalise a query body. Throws DataviewError on bad input. */
export function validateQuery(raw: unknown): DataviewQuery {
  if (!raw || typeof raw !== 'object') {
    throw new DataviewError('query body must be a JSON object');
  }
  const q = raw as Record<string, unknown>;
  if (typeof q.type !== 'string') {
    throw new DataviewError('query.type is required (string)');
  }
  const spec = TYPE_REGISTRY[q.type];
  if (!spec) {
    throw new DataviewError(
      `unknown type "${q.type}" — supported: ${listSupportedTypes().join(', ')}`,
    );
  }

  let filter: Record<string, DataviewFilterValue> | undefined;
  if (q.filter !== undefined) {
    if (!q.filter || typeof q.filter !== 'object') {
      throw new DataviewError('filter must be an object');
    }
    filter = {};
    for (const [k, v] of Object.entries(q.filter as Record<string, unknown>)) {
      if (!spec.filterable.has(k)) {
        throw new DataviewError(`filter key "${k}" not allowed for type "${q.type}"`);
      }
      filter[k] = v as DataviewFilterValue;
    }
  }

  let sort: string | undefined;
  if (q.sort !== undefined) {
    if (typeof q.sort !== 'string') throw new DataviewError('sort must be a string');
    const bare = q.sort.startsWith('-') ? q.sort.slice(1) : q.sort;
    if (!spec.sortable.has(bare)) {
      throw new DataviewError(`sort key "${bare}" not allowed for type "${q.type}"`);
    }
    sort = q.sort;
  }

  let columns: string[] | undefined;
  if (q.columns !== undefined) {
    if (!Array.isArray(q.columns) || q.columns.some((c) => typeof c !== 'string')) {
      throw new DataviewError('columns must be an array of strings');
    }
    for (const c of q.columns) {
      if (!spec.columns.includes(c as string)) {
        throw new DataviewError(`column "${c}" not allowed for type "${q.type}"`);
      }
    }
    columns = q.columns as string[];
  }

  let limit: number | undefined;
  if (q.limit !== undefined) {
    const n = typeof q.limit === 'number' ? q.limit : parseInt(String(q.limit), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new DataviewError('limit must be a positive integer');
    }
    limit = Math.min(Math.floor(n), MAX_LIMIT);
  }

  return { type: q.type, filter, sort, columns, limit };
}

/* --------------------------------------------------------------------- */
/* Filter helpers                                                         */
/* --------------------------------------------------------------------- */

/**
 * Translate one filter entry into a Drizzle SQL condition. `colMap` resolves
 * the *string* key the caller used to the actual Drizzle column expression
 * (so 'company' on contacts/deals can map to the joined company-name column).
 */
function buildFilterCond(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colMap: Record<string, any>,
  key: string,
  value: DataviewFilterValue,
): SQL | undefined {
  const col = colMap[key];
  if (!col) return undefined;

  if (value && typeof value === 'object' && 'op' in value) {
    switch (value.op) {
      case 'in':
        if (!Array.isArray(value.value) || value.value.length === 0) return undefined;
        return inArray(col, value.value);
      case 'gt':
        return gt(col, value.value);
      case 'lt':
        return lt(col, value.value);
      case 'like':
        return ilike(col, `%${value.value}%`);
    }
    return undefined;
  }
  if (value === null) return sql`${col} IS NULL`;
  return eq(col, value as string | number | boolean);
}

function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colMap: Record<string, any>,
  filter: DataviewQuery['filter'],
  baseConds: SQL[],
): SQL | undefined {
  const conds = [...baseConds];
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      const c = buildFilterCond(colMap, k, v);
      if (c) conds.push(c);
    }
  }
  return conds.length === 1 ? conds[0] : and(...conds);
}

function pickColumns(spec: TypeSpec, requested: string[] | undefined): string[] {
  if (!requested || requested.length === 0) {
    // Sensible default subset (avoid dumping createdAt/id by default unless asked).
    return spec.columns.filter((c) => c !== 'id' && c !== 'createdAt');
  }
  return requested;
}

/** Resolve `sort` ('-foo' / 'foo') against a column map. */
function buildOrderBy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colMap: Record<string, any>,
  sortStr: string | undefined,
  defaultSort: TypeSpec['defaultSort'],
) {
  const eff = sortStr ?? (defaultSort.dir === 'desc' ? `-${defaultSort.col}` : defaultSort.col);
  const dir = eff.startsWith('-') ? 'desc' : 'asc';
  const key = eff.startsWith('-') ? eff.slice(1) : eff;
  const col = colMap[key];
  if (!col) return undefined;
  return dir === 'desc' ? desc(col) : asc(col);
}

/* --------------------------------------------------------------------- */
/* Per-type executors                                                     */
/* --------------------------------------------------------------------- */

async function runNotes(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.notes;
  const colMap = {
    id: brainNotes.id,
    title: brainNotes.title,
    tags: brainNotes.tags,
    pinned: brainNotes.pinned,
    sourceUrl: brainNotes.sourceUrl,
    updatedAt: brainNotes.updatedAt,
    createdAt: brainNotes.createdAt,
    companyId: brainNotes.companyId,
    dealId: brainNotes.dealId,
    contactId: brainNotes.contactId,
    meetingId: brainNotes.meetingId,
  };
  const where = applyFilters(colMap, q.filter, [eq(brainNotes.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: brainNotes.id,
      title: brainNotes.title,
      tags: brainNotes.tags,
      pinned: brainNotes.pinned,
      sourceUrl: brainNotes.sourceUrl,
      updatedAt: brainNotes.updatedAt,
      createdAt: brainNotes.createdAt,
    })
    .from(brainNotes)
    .where(where)
    .orderBy(orderBy ?? desc(brainNotes.updatedAt))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runMeetings(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.meetings;
  const colMap = {
    id: brainMeetings.id,
    title: brainMeetings.title,
    status: brainMeetings.status,
    meetingDate: brainMeetings.meetingDate,
    updatedAt: brainMeetings.updatedAt,
    createdAt: brainMeetings.createdAt,
    companyId: brainMeetings.companyId,
    dealId: brainMeetings.dealId,
  };
  const where = applyFilters(colMap, q.filter, [eq(brainMeetings.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: brainMeetings.id,
      title: brainMeetings.title,
      status: brainMeetings.status,
      meetingDate: brainMeetings.meetingDate,
      updatedAt: brainMeetings.updatedAt,
      createdAt: brainMeetings.createdAt,
    })
    .from(brainMeetings)
    .where(where)
    .orderBy(orderBy ?? desc(brainMeetings.meetingDate))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runTasks(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.tasks;
  const colMap = {
    id: brainTasks.id,
    title: brainTasks.title,
    status: brainTasks.status,
    priority: brainTasks.priority,
    dueDate: brainTasks.dueDate,
    updatedAt: brainTasks.updatedAt,
    createdAt: brainTasks.createdAt,
    ownerId: brainTasks.ownerId,
    meetingId: brainTasks.meetingId,
    companyId: brainTasks.companyId,
    dealId: brainTasks.dealId,
  };
  const where = applyFilters(colMap, q.filter, [eq(brainTasks.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: brainTasks.id,
      title: brainTasks.title,
      status: brainTasks.status,
      priority: brainTasks.priority,
      dueDate: brainTasks.dueDate,
      updatedAt: brainTasks.updatedAt,
      createdAt: brainTasks.createdAt,
    })
    .from(brainTasks)
    .where(where)
    .orderBy(orderBy ?? desc(brainTasks.updatedAt))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runCompanies(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.companies;
  const colMap = {
    id: crmCompanies.id,
    name: crmCompanies.name,
    domain: crmCompanies.domain,
    industry: crmCompanies.industry,
    size: crmCompanies.size,
    updatedAt: crmCompanies.updatedAt,
    createdAt: crmCompanies.createdAt,
  };
  const where = applyFilters(colMap, q.filter, [eq(crmCompanies.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
      size: crmCompanies.size,
      updatedAt: crmCompanies.updatedAt,
      createdAt: crmCompanies.createdAt,
    })
    .from(crmCompanies)
    .where(where)
    .orderBy(orderBy ?? asc(crmCompanies.name))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runContacts(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.contacts;
  // 'name' is firstName || ' ' || lastName (synthesised). 'company' = joined company name.
  const nameExpr = sql<string>`trim(${crmContacts.firstName} || ' ' || coalesce(${crmContacts.lastName}, ''))`;
  const companyExpr = sql<string | null>`${crmCompanies.name}`;

  const colMap = {
    id: crmContacts.id,
    name: nameExpr,
    firstName: crmContacts.firstName,
    lastName: crmContacts.lastName,
    email: crmContacts.email,
    title: crmContacts.title,
    company: companyExpr,
    status: crmContacts.status,
    updatedAt: crmContacts.updatedAt,
    createdAt: crmContacts.createdAt,
    companyId: crmContacts.companyId,
  };
  const where = applyFilters(colMap, q.filter, [eq(crmContacts.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: crmContacts.id,
      name: nameExpr,
      email: crmContacts.email,
      title: crmContacts.title,
      company: companyExpr,
      status: crmContacts.status,
      updatedAt: crmContacts.updatedAt,
      createdAt: crmContacts.createdAt,
    })
    .from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .where(where)
    .orderBy(orderBy ?? desc(crmContacts.updatedAt))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runDeals(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.deals;
  const dealCompany = alias(crmCompanies, 'deal_company');
  const companyExpr = sql<string | null>`${dealCompany.name}`;

  const colMap = {
    id: crmDeals.id,
    title: crmDeals.title,
    status: crmDeals.status,
    priority: crmDeals.priority,
    value: crmDeals.value,
    company: companyExpr,
    updatedAt: crmDeals.updatedAt,
    createdAt: crmDeals.createdAt,
    companyId: crmDeals.companyId,
    contactId: crmDeals.contactId,
    pipelineId: crmDeals.pipelineId,
    stageId: crmDeals.stageId,
    ownerId: crmDeals.ownerId,
  };
  const where = applyFilters(colMap, q.filter, [eq(crmDeals.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      status: crmDeals.status,
      priority: crmDeals.priority,
      value: crmDeals.value,
      company: companyExpr,
      updatedAt: crmDeals.updatedAt,
      createdAt: crmDeals.createdAt,
    })
    .from(crmDeals)
    .leftJoin(dealCompany, eq(crmDeals.companyId, dealCompany.id))
    .where(where)
    .orderBy(orderBy ?? desc(crmDeals.updatedAt))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

async function runPosts(clientId: number, q: DataviewQuery): Promise<DataviewResult> {
  const spec = TYPE_REGISTRY.posts;
  // posts.clientId doesn't exist — scoping happens via client_websites.clientId.
  // Agency-level posts (websiteId IS NULL) are intentionally excluded from
  // tenant dataview because they aren't owned by any client.
  const colMap = {
    id: posts.id,
    title: posts.title,
    slug: posts.slug,
    published: posts.published,
    postType: posts.postType,
    updatedAt: posts.updatedAt,
    createdAt: posts.createdAt,
    websiteId: posts.websiteId,
  };
  const where = applyFilters(colMap, q.filter, [eq(clientWebsites.clientId, clientId)]);
  const orderBy = buildOrderBy(colMap, q.sort, spec.defaultSort);
  const limit = q.limit ?? MAX_LIMIT;

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      published: posts.published,
      postType: posts.postType,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .innerJoin(clientWebsites, eq(posts.websiteId, clientWebsites.id))
    .where(where)
    .orderBy(orderBy ?? desc(posts.updatedAt))
    .limit(limit);

  const columns = pickColumns(spec, q.columns);
  return { rows: projectRows(rows, columns), columns };
}

/** Project a row set down to just the requested columns (in order). */
function projectRows(
  rows: Array<Record<string, unknown>>,
  columns: string[],
): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = r[c] ?? null;
    return out;
  });
}

/** Public entry point. Always tenant-scoped via `clientId`. */
export async function runDataview(
  clientId: number,
  query: DataviewQuery,
): Promise<DataviewResult> {
  switch (query.type) {
    case 'notes': return runNotes(clientId, query);
    case 'meetings': return runMeetings(clientId, query);
    case 'tasks': return runTasks(clientId, query);
    case 'companies': return runCompanies(clientId, query);
    case 'contacts': return runContacts(clientId, query);
    case 'deals': return runDeals(clientId, query);
    case 'posts': return runPosts(clientId, query);
    default:
      // validateQuery rejects unknown types; this branch only fires if a new
      // type is added to TYPE_REGISTRY but not wired here.
      throw new DataviewError(`type "${query.type}" has no executor`, 500);
  }
}
