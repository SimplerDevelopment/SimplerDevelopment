import { db } from '@/lib/db';
import { brainNotes, brainKbLinks, brainMeetings } from '@/lib/db/schema';
import { crmCompanies, crmContacts, crmDeals } from '@/lib/db/schema/crm';
import { and, eq, isNull, isNotNull, inArray, sql } from 'drizzle-orm';

/**
 * Knowledge graph helper — pulls the active client's notes and the
 * Obsidian-style wikilink edges between them so the front-end can render a
 * force-directed graph view at /portal/brain/knowledge/graph.
 *
 * Tenant-scoped on every query (clientId is the first WHERE on every read).
 * Soft-deleted notes are excluded (deletedAt IS NULL) so trashed nodes don't
 * leak into the graph. Edges are filtered to those with a non-null target so
 * we never render half-attached lines pointing at vanished notes.
 *
 * ## Node IDs
 * Node ids are prefixed strings — `note:<n>`, `company:<n>`, `contact:<n>`,
 * `deal:<n>`, `meeting:<n>`. We chose prefixed strings (rather than raw numeric
 * ids) so we can mix multiple entity kinds in the same graph without primary-key
 * collisions across tables. The Obsidian-style note→note edges that exist today
 * are still emitted, just with `note:` prefixes on both endpoints.
 */

export type GraphNodeKind = 'note' | 'company' | 'contact' | 'deal' | 'meeting';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  title: string;
  tags: string[];
  pinned: boolean;
  hasIncoming: boolean;
  hasOutgoing: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface GetKnowledgeGraphOpts {
  /** Same matching rule as listNotes(): `tags::jsonb @> [tag]`. */
  tag?: string;
  /** Return only nodes that have no incoming edges (true orphans). */
  orphansOnly?: boolean;
  /**
   * Also pull in the CRM/meeting entities each note is anchored to and emit
   * note→entity edges. Entities don't count against the MAX_NODES cap because
   * they're naturally bounded by the number of notes referencing them.
   */
  includeCrm?: boolean;
}

/** Hard cap on NOTE nodes so a runaway tenant can't blow up the canvas
 *  renderer. CRM entities don't count against this. */
const MAX_NODES = 1000;

const noteId = (n: number) => `note:${n}`;
const companyId = (n: number) => `company:${n}`;
const contactId = (n: number) => `contact:${n}`;
const dealId = (n: number) => `deal:${n}`;
const meetingId = (n: number) => `meeting:${n}`;

export async function getKnowledgeGraph(
  clientId: number,
  opts: GetKnowledgeGraphOpts = {},
): Promise<KnowledgeGraph> {
  const conds = [eq(brainNotes.clientId, clientId), isNull(brainNotes.deletedAt)];
  if (opts.tag) {
    conds.push(sql`${brainNotes.tags}::jsonb @> ${JSON.stringify([opts.tag])}::jsonb`);
  }

  const noteRows = await db
    .select({
      id: brainNotes.id,
      title: brainNotes.title,
      tags: brainNotes.tags,
      pinned: brainNotes.pinned,
      companyId: brainNotes.companyId,
      contactId: brainNotes.contactId,
      dealId: brainNotes.dealId,
      meetingId: brainNotes.meetingId,
    })
    .from(brainNotes)
    .where(and(...conds))
    .limit(MAX_NODES + 1);

  const truncated = noteRows.length > MAX_NODES;
  const trimmed = truncated ? noteRows.slice(0, MAX_NODES) : noteRows;
  const nodeIds = trimmed.map((n) => n.id);
  const nodeIdSet = new Set(nodeIds);

  // Pull edges for this client where both endpoints are non-null AND survive
  // the node filter above (tag scoping). If we have no nodes there can't be
  // any edges either — short-circuit.
  let edgeRows: Array<{ fromNoteId: number; toNoteId: number | null }> = [];
  if (nodeIds.length > 0) {
    edgeRows = await db
      .select({
        fromNoteId: brainKbLinks.fromNoteId,
        toNoteId: brainKbLinks.toNoteId,
      })
      .from(brainKbLinks)
      .where(
        and(
          eq(brainKbLinks.clientId, clientId),
          isNotNull(brainKbLinks.toNoteId),
          inArray(brainKbLinks.fromNoteId, nodeIds),
          // We can't inArray against a nullable column ergonomically here —
          // we'll filter out non-surviving targets in JS below.
        ),
      );
  }

  const edges: GraphEdge[] = [];
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  // Dedupe edges — wikilinks can be repeated within the same note body and
  // we don't want a thicker line per duplicate.
  const seen = new Set<string>();

  for (const row of edgeRows) {
    if (row.toNoteId == null) continue;
    if (!nodeIdSet.has(row.fromNoteId) || !nodeIdSet.has(row.toNoteId)) continue;
    if (row.fromNoteId === row.toNoteId) continue; // self-loops add no info
    const sourceId = noteId(row.fromNoteId);
    const targetId = noteId(row.toNoteId);
    const key = `${sourceId}->${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: sourceId, target: targetId });
    outgoing.add(sourceId);
    incoming.add(targetId);
  }

  let nodes: GraphNode[] = trimmed.map((n) => ({
    id: noteId(n.id),
    kind: 'note',
    title: n.title,
    tags: Array.isArray(n.tags) ? n.tags : [],
    pinned: n.pinned ?? false,
    hasIncoming: incoming.has(noteId(n.id)),
    hasOutgoing: outgoing.has(noteId(n.id)),
  }));

  // Optional: enrich the graph with cross-entity links (note → CRM record /
  // meeting). Entity nodes are naturally bounded by the size of `trimmed` so
  // they aren't subject to MAX_NODES. We still scope each fetch to clientId to
  // keep tenancy invariants honest, even though ownership is implied by the
  // surviving note set.
  if (opts.includeCrm && trimmed.length > 0) {
    const companyIds = uniqueIds(trimmed, (n) => n.companyId);
    const contactIds = uniqueIds(trimmed, (n) => n.contactId);
    const dealIds = uniqueIds(trimmed, (n) => n.dealId);
    const meetingIds = uniqueIds(trimmed, (n) => n.meetingId);

    const [companyRows, contactRows, dealRows, meetingRows] = await Promise.all([
      companyIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; name: string }>)
        : db
            .select({ id: crmCompanies.id, name: crmCompanies.name })
            .from(crmCompanies)
            .where(and(eq(crmCompanies.clientId, clientId), inArray(crmCompanies.id, companyIds))),
      contactIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; firstName: string; lastName: string | null }>)
        : db
            .select({
              id: crmContacts.id,
              firstName: crmContacts.firstName,
              lastName: crmContacts.lastName,
            })
            .from(crmContacts)
            .where(and(eq(crmContacts.clientId, clientId), inArray(crmContacts.id, contactIds))),
      dealIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; title: string }>)
        : db
            .select({ id: crmDeals.id, title: crmDeals.title })
            .from(crmDeals)
            .where(and(eq(crmDeals.clientId, clientId), inArray(crmDeals.id, dealIds))),
      meetingIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; title: string; meetingDate: Date | null }>)
        : db
            .select({
              id: brainMeetings.id,
              title: brainMeetings.title,
              meetingDate: brainMeetings.meetingDate,
            })
            .from(brainMeetings)
            .where(and(eq(brainMeetings.clientId, clientId), inArray(brainMeetings.id, meetingIds))),
    ]);

    const companyById = new Map(companyRows.map((r) => [r.id, r] as const));
    const contactById = new Map(contactRows.map((r) => [r.id, r] as const));
    const dealById = new Map(dealRows.map((r) => [r.id, r] as const));
    const meetingById = new Map(meetingRows.map((r) => [r.id, r] as const));

    const entityNodes = new Map<string, GraphNode>();
    const ensureEntity = (node: GraphNode) => {
      if (!entityNodes.has(node.id)) entityNodes.set(node.id, node);
    };

    for (const n of trimmed) {
      const noteIdStr = noteId(n.id);

      if (n.companyId != null) {
        const row = companyById.get(n.companyId);
        if (row) {
          const entId = companyId(row.id);
          ensureEntity({
            id: entId,
            kind: 'company',
            title: row.name,
            tags: [],
            pinned: false,
            hasIncoming: false,
            hasOutgoing: false,
          });
          pushEdge(edges, seen, noteIdStr, entId);
        }
      }

      if (n.contactId != null) {
        const row = contactById.get(n.contactId);
        if (row) {
          const entId = contactId(row.id);
          const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
          ensureEntity({
            id: entId,
            kind: 'contact',
            title: fullName || `Contact #${row.id}`,
            tags: [],
            pinned: false,
            hasIncoming: false,
            hasOutgoing: false,
          });
          pushEdge(edges, seen, noteIdStr, entId);
        }
      }

      if (n.dealId != null) {
        const row = dealById.get(n.dealId);
        if (row) {
          const entId = dealId(row.id);
          ensureEntity({
            id: entId,
            kind: 'deal',
            title: row.title,
            tags: [],
            pinned: false,
            hasIncoming: false,
            hasOutgoing: false,
          });
          pushEdge(edges, seen, noteIdStr, entId);
        }
      }

      if (n.meetingId != null) {
        const row = meetingById.get(n.meetingId);
        if (row) {
          const entId = meetingId(row.id);
          const date = row.meetingDate ? formatMeetingDate(row.meetingDate) : null;
          ensureEntity({
            id: entId,
            kind: 'meeting',
            title: row.title || (date ? `Meeting · ${date}` : `Meeting #${row.id}`),
            tags: [],
            pinned: false,
            hasIncoming: false,
            hasOutgoing: false,
          });
          pushEdge(edges, seen, noteIdStr, entId);
        }
      }
    }

    nodes = nodes.concat(Array.from(entityNodes.values()));
  }

  if (opts.orphansOnly) {
    // "Orphan" = nothing points at this note. We still keep the node's own
    // outgoing edges in the result, but only between surviving orphan nodes;
    // re-filter the edge list to match. CRM-link edges always count as
    // "outgoing from the note", never as "incoming on the note", so this
    // filter doesn't accidentally deorphan a note just because we attached a
    // company to it.
    nodes = nodes.filter((n) => n.kind !== 'note' || !n.hasIncoming);
    const surviving = new Set(nodes.map((n) => n.id));
    const filteredEdges = edges.filter((e) => surviving.has(e.source) && surviving.has(e.target));
    return { nodes, edges: filteredEdges, truncated };
  }

  return { nodes, edges, truncated };
}

function uniqueIds<T>(rows: T[], pick: (row: T) => number | null | undefined): number[] {
  const set = new Set<number>();
  for (const row of rows) {
    const v = pick(row);
    if (v != null) set.add(v);
  }
  return Array.from(set);
}

function pushEdge(edges: GraphEdge[], seen: Set<string>, source: string, target: string) {
  const key = `${source}->${target}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target });
}

function formatMeetingDate(d: Date): string {
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}
