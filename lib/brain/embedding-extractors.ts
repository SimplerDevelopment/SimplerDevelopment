/**
 * Per-entity-type content extractors. Each one knows how to fetch a row by
 * id (scoped to clientId for tenancy safety) and produce the text string
 * that should be embedded.
 *
 * The extractors are intentionally lossy: they emit the *searchable* shape
 * of an entity, not the full record. Things like timestamps, internal IDs,
 * URLs, etc. are skipped — they don't help semantic retrieval.
 *
 * Adding a new entity type = adding one function here + one branch in
 * extractContentForEntity. The rest of the embedding pipeline (chunker,
 * batcher, store) doesn't change.
 */

import { db } from '@/lib/db';
import {
  brainNotes,
  brainMeetings,
  brainTasks,
  brainRelationshipOverlays,
  crmCompanies,
  crmContacts,
  crmDeals,
  posts,
  clientWebsites,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { EntityType } from './embeddings';

export interface ExtractedContent {
  text: string;
  /** Whether the entity exists. False means the row was deleted; caller should
   *  treat this as a signal to remove any prior embeddings. */
  found: boolean;
}

/**
 * Fetch + extract text for any supported entity type. Returns an empty string
 * when there's nothing meaningful to embed (e.g. a contact with no name and
 * no notes). Caller still gets `found: true` in that case so it can skip
 * embedding rather than trigger a delete.
 */
export async function extractContentForEntity(
  clientId: number,
  entityType: EntityType,
  entityId: number,
): Promise<ExtractedContent> {
  switch (entityType) {
    case 'note': return extractNote(clientId, entityId);
    case 'meeting': return extractMeeting(clientId, entityId);
    case 'relationship': return extractRelationship(clientId, entityId);
    case 'task': return extractTask(clientId, entityId);
    case 'company': return extractCompany(clientId, entityId);
    case 'contact': return extractContact(clientId, entityId);
    case 'deal': return extractDeal(clientId, entityId);
    case 'post': return extractPost(clientId, entityId);
  }
}

async function extractNote(clientId: number, id: number): Promise<ExtractedContent> {
  const [n] = await db.select({
    title: brainNotes.title,
    body: brainNotes.body,
    tags: brainNotes.tags,
  }).from(brainNotes)
    .where(and(eq(brainNotes.clientId, clientId), eq(brainNotes.id, id)))
    .limit(1);
  if (!n) return { text: '', found: false };
  const tagStr = (n.tags ?? []).join(', ');
  const parts = [n.title, tagStr ? `Tags: ${tagStr}` : null, n.body].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n\n'), found: true };
}

async function extractMeeting(clientId: number, id: number): Promise<ExtractedContent> {
  const [m] = await db.select({
    title: brainMeetings.title,
    aiSummary: brainMeetings.aiSummary,
    humanSummary: brainMeetings.humanSummary,
    transcript: brainMeetings.transcript,
  }).from(brainMeetings)
    .where(and(eq(brainMeetings.clientId, clientId), eq(brainMeetings.id, id)))
    .limit(1);
  if (!m) return { text: '', found: false };
  // Prefer human-curated summary > AI summary > transcript. Embed the highest-
  // signal version available; transcripts are noisy and long.
  const body = m.humanSummary || m.aiSummary || m.transcript || '';
  const parts = [m.title, body].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n\n'), found: true };
}

async function extractRelationship(clientId: number, id: number): Promise<ExtractedContent> {
  const [r] = await db.select({
    relationshipType: brainRelationshipOverlays.relationshipType,
    summary: brainRelationshipOverlays.summary,
    currentPriorities: brainRelationshipOverlays.currentPriorities,
    openLoops: brainRelationshipOverlays.openLoops,
    companyId: brainRelationshipOverlays.companyId,
    dealId: brainRelationshipOverlays.dealId,
  }).from(brainRelationshipOverlays)
    .where(and(eq(brainRelationshipOverlays.clientId, clientId), eq(brainRelationshipOverlays.id, id)))
    .limit(1);
  if (!r) return { text: '', found: false };

  // Pull the linked CRM record's name so embedding has a noun to anchor on.
  let anchor = '';
  if (r.companyId) {
    const [c] = await db.select({ name: crmCompanies.name })
      .from(crmCompanies).where(eq(crmCompanies.id, r.companyId)).limit(1);
    anchor = c?.name ?? '';
  } else if (r.dealId) {
    const [d] = await db.select({ title: crmDeals.title })
      .from(crmDeals).where(eq(crmDeals.id, r.dealId)).limit(1);
    anchor = d?.title ?? '';
  }

  const parts = [
    anchor ? `Relationship: ${anchor} (${r.relationshipType})` : `Relationship: ${r.relationshipType}`,
    r.summary ? `Summary: ${r.summary}` : null,
    r.currentPriorities ? `Priorities: ${r.currentPriorities}` : null,
    r.openLoops ? `Open loops: ${r.openLoops}` : null,
  ].filter((s): s is string => !!s);
  return { text: parts.join('\n\n'), found: true };
}

async function extractTask(clientId: number, id: number): Promise<ExtractedContent> {
  const [t] = await db.select({
    title: brainTasks.title,
    description: brainTasks.description,
    status: brainTasks.status,
    priority: brainTasks.priority,
  }).from(brainTasks)
    .where(and(eq(brainTasks.clientId, clientId), eq(brainTasks.id, id)))
    .limit(1);
  if (!t) return { text: '', found: false };
  const parts = [
    t.title,
    `Status: ${t.status} · Priority: ${t.priority}`,
    t.description ?? null,
  ].filter((s): s is string => !!s);
  return { text: parts.join('\n\n'), found: true };
}

async function extractCompany(clientId: number, id: number): Promise<ExtractedContent> {
  const [c] = await db.select({
    name: crmCompanies.name,
    domain: crmCompanies.domain,
    industry: crmCompanies.industry,
    size: crmCompanies.size,
    description: crmCompanies.description,
    notes: crmCompanies.notes,
    address: crmCompanies.address,
  }).from(crmCompanies)
    .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.id, id)))
    .limit(1);
  if (!c) return { text: '', found: false };
  const parts = [
    c.name,
    [c.domain, c.industry, c.size ? `${c.size} employees` : null].filter(Boolean).join(' · '),
    c.address ?? null,
    c.description ?? null,
    c.notes ?? null,
  ].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n\n'), found: true };
}

async function extractContact(clientId: number, id: number): Promise<ExtractedContent> {
  const [c] = await db.select({
    firstName: crmContacts.firstName,
    lastName: crmContacts.lastName,
    email: crmContacts.email,
    title: crmContacts.title,
    department: crmContacts.department,
    seniority: crmContacts.seniority,
    notes: crmContacts.notes,
    companyId: crmContacts.companyId,
  }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.id, id)))
    .limit(1);
  if (!c) return { text: '', found: false };

  // Fetch company name for context — a contact "Jane Doe" is much more
  // searchable when paired with "VP Marketing at Acme Corp".
  let companyName = '';
  if (c.companyId) {
    const [co] = await db.select({ name: crmCompanies.name })
      .from(crmCompanies).where(eq(crmCompanies.id, c.companyId)).limit(1);
    companyName = co?.name ?? '';
  }

  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const role = [c.title, c.department, c.seniority].filter(Boolean).join(' · ');
  const parts = [
    fullName,
    companyName ? `${role || 'Contact'} at ${companyName}` : role,
    c.email ?? null,
    c.notes ?? null,
  ].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n'), found: true };
}

async function extractDeal(clientId: number, id: number): Promise<ExtractedContent> {
  const [d] = await db.select({
    title: crmDeals.title,
    notes: crmDeals.notes,
    status: crmDeals.status,
    priority: crmDeals.priority,
    value: crmDeals.value,
    currency: crmDeals.currency,
    companyId: crmDeals.companyId,
    contactId: crmDeals.contactId,
  }).from(crmDeals)
    .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.id, id)))
    .limit(1);
  if (!d) return { text: '', found: false };

  let companyName = '';
  if (d.companyId) {
    const [co] = await db.select({ name: crmCompanies.name })
      .from(crmCompanies).where(eq(crmCompanies.id, d.companyId)).limit(1);
    companyName = co?.name ?? '';
  }
  let contactName = '';
  if (d.contactId) {
    const [ct] = await db.select({ firstName: crmContacts.firstName, lastName: crmContacts.lastName })
      .from(crmContacts).where(eq(crmContacts.id, d.contactId)).limit(1);
    if (ct) contactName = [ct.firstName, ct.lastName].filter(Boolean).join(' ');
  }

  const valueStr = d.value !== null && d.value !== undefined
    ? `${(d.value / 100).toLocaleString('en-US', { style: 'currency', currency: d.currency ?? 'USD' })}`
    : null;

  const meta = [
    d.status ? `Status: ${d.status}` : null,
    d.priority ? `Priority: ${d.priority}` : null,
    valueStr ? `Value: ${valueStr}` : null,
    companyName ? `Company: ${companyName}` : null,
    contactName ? `Contact: ${contactName}` : null,
  ].filter(Boolean).join(' · ');

  const parts = [
    d.title,
    meta || null,
    d.notes ?? null,
  ].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n\n'), found: true };
}

/**
 * Posts: content is JSON blocks. Walk the tree, collect string values that
 * look like content (long enough, not URLs, not internal keys), join them.
 *
 * Crude but effective — block types vary too much to enumerate. False
 * positives (e.g. extracting an alt text we wouldn't want) are tolerable
 * since the embedding model handles noise gracefully.
 *
 * Posts don't have a clientId column directly; tenancy goes through
 * websiteId -> client_websites.client_id. Verifies the post belongs to the
 * given client.
 */
async function extractPost(clientId: number, id: number): Promise<ExtractedContent> {
  const [p] = await db.select({
    id: posts.id,
    title: posts.title,
    excerpt: posts.excerpt,
    content: posts.content,
    websiteId: posts.websiteId,
  }).from(posts).where(eq(posts.id, id)).limit(1);
  if (!p) return { text: '', found: false };

  // Tenancy check via website ownership. websiteId can be null for
  // agency-level posts; treat those as not belonging to any tenant client.
  if (p.websiteId === null) return { text: '', found: false };
  const [w] = await db.select({ clientId: clientWebsites.clientId })
    .from(clientWebsites).where(eq(clientWebsites.id, p.websiteId)).limit(1);
  if (!w || w.clientId !== clientId) return { text: '', found: false };

  // Try to parse content as block JSON. Fall back to treating it as plain
  // text (legacy posts, draft state, etc.) when parsing fails.
  let blockText = '';
  if (p.content && p.content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(p.content);
      blockText = collectStringsFromBlocks(parsed).join('\n');
    } catch {
      blockText = p.content;
    }
  } else {
    blockText = p.content ?? '';
  }

  const parts = [p.title, p.excerpt ?? null, blockText].filter((s): s is string => !!s && s.length > 0);
  return { text: parts.join('\n\n'), found: true };
}

const SKIP_KEYS = new Set([
  'id', 'type', 'order', 'style', 'styles', 'className', 'classNames',
  'href', 'src', 'url', 'link', 'icon', 'color', 'backgroundColor',
  'image', 'backgroundImage', 'logoUrl', 'avatarUrl', 'cssVar', 'value',
  'duration', 'speed', 'animation', 'effect', 'variant', 'mode', 'size',
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing',
  'padding', 'margin', 'gap', 'width', 'height', 'borderRadius',
  'textAlign', 'flexDirection', 'justifyContent', 'alignItems',
  'visible', 'enabled', 'disabled', 'hidden', 'expanded', 'open',
  'columns', 'rows', 'aspectRatio', 'tags', 'category',
]);

const URL_LIKE = /^(https?:\/\/|\/|#|mailto:|tel:|data:)/i;
const HEX_LIKE = /^#?[0-9a-fA-F]{3,8}$/;

function collectStringsFromBlocks(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    const s = node.trim();
    // Filter out obvious non-content: URLs, hex colors, single tokens.
    if (s.length < 4) return out;
    if (URL_LIKE.test(s)) return out;
    if (HEX_LIKE.test(s)) return out;
    out.push(s);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStringsFromBlocks(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_KEYS.has(key)) continue;
      collectStringsFromBlocks(value, out);
    }
  }
  return out;
}
