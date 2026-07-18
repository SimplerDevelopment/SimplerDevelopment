/**
 * SD Chat — Brain API types
 *
 * Mirrors the response shapes returned by the SimplerDevelopment portal at
 * `/api/portal/brain/*`. These types match what the routes actually return
 * (Drizzle `$inferSelect` rows, slim list projections, search hits) — not
 * the mobile UI's pre-existing mock shapes (those live in `lib/mock/brain.ts`
 * and are kept around for component prop compatibility).
 *
 * Field-level notes:
 * - Timestamps are ISO 8601 strings (Postgres `timestamp` columns serialize
 *   that way over JSON; the lib helpers return Date objects but Next's
 *   default JSON serializer turns them into ISO strings before they reach
 *   the wire).
 * - `tags`, `aliases`, `profileUrls`, `relatedTermIds` arrive parsed (the
 *   columns are `json`).
 */
import type { MIconProps } from '@/components/atoms/MIcon';

/** Drizzle `brain_notes.$inferSelect` row, serialized. */
export interface BrainNoteRow {
  id: number;
  clientId: number;
  title: string;
  body: string;
  meetingId: number | null;
  relationshipOverlayId: number | null;
  companyId: number | null;
  dealId: number | null;
  contactId: number | null;
  tags: string[];
  confidentialityLevel: string;
  pinned: boolean;
  source: string;
  reviewItemId: number | null;
  sourceUrl: string | null;
  attachmentUrl: string | null;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | null;
  attachmentStoredKey: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Wire response of `GET /api/portal/brain/knowledge`. */
export interface BrainNotesListResponse {
  items: BrainNoteRow[];
  total: number;
  limit: number;
  offset: number;
}

export type BrainDecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'rejected';
export type BrainDecisionReversibility = 'one_way' | 'two_way';

/** Drizzle `brain_decisions.$inferSelect` row, serialized. */
export interface BrainDecisionRow {
  id: number;
  clientId: number;
  title: string;
  context: string | null;
  decision: string;
  rationale: string;
  alternativesConsidered: string | null;
  reversibility: BrainDecisionReversibility;
  status: BrainDecisionStatus;
  decisionMakerId: number | null;
  decidedAt: string;
  supersededByDecisionId: number | null;
  meetingId: number | null;
  noteId: number | null;
  companyId: number | null;
  dealId: number | null;
  source: string;
  reviewItemId: number | null;
  confidentialityLevel: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight node for the supersede chain returned alongside a decision. */
export interface BrainDecisionChainNode {
  id: number;
  title: string;
  status: BrainDecisionStatus;
  decidedAt: string;
}

/** Wire response of `GET /api/portal/brain/decisions`. */
export interface BrainDecisionsListResponse {
  items: BrainDecisionRow[];
  limit: number;
  offset: number;
}

/** Wire response of `GET /api/portal/brain/decisions/[id]`. */
export interface BrainDecisionDetail {
  decision: BrainDecisionRow;
  ancestors: BrainDecisionChainNode[];
  descendants: BrainDecisionChainNode[];
}

export type BrainPersonStatus = 'active' | 'inactive' | 'departed';

/** Slim row returned by `GET /api/portal/brain/people`. */
export interface BrainPersonListRow {
  id: number;
  fullName: string;
  email: string | null;
  title: string | null;
  status: BrainPersonStatus;
  managerId: number | null;
  primaryOrgUnit: { id: number; name: string } | null;
}

/** Wire response of `GET /api/portal/brain/people`. */
export interface BrainPeopleListResponse {
  items: BrainPersonListRow[];
}

/** Full `brain_people.$inferSelect` row, serialized. */
export interface BrainPersonRow {
  id: number;
  clientId: number;
  userId: number | null;
  fullName: string;
  email: string | null;
  managerId: number | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  status: BrainPersonStatus;
  notes: string | null;
  profileUrls: { label: string; url: string }[];
  source: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrainPersonRelationSummary {
  id: number;
  fullName: string;
  title: string | null;
}

export interface BrainPersonOrgUnitSummary {
  id: number;
  name: string;
  path: string;
  primary: boolean;
  roleInUnit: string | null;
}

export interface BrainPersonExpertiseSummary {
  tagId: number;
  name: string;
  level: number | null;
}

/** Wire response of `GET /api/portal/brain/people/[id]`. */
export interface BrainPersonDetail {
  person: BrainPersonRow;
  manager: BrainPersonRelationSummary | null;
  directReports: BrainPersonRelationSummary[];
  orgUnits: BrainPersonOrgUnitSummary[];
  expertise: BrainPersonExpertiseSummary[];
}

export type BrainGlossaryStatus = 'active' | 'deprecated';

/** Slim row returned in the list response. */
export interface BrainGlossaryListRow {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  status: BrainGlossaryStatus;
  category: string | null;
  ownerId: number | null;
  aliasCount: number;
}

/** Wire response of `GET /api/portal/brain/glossary`. */
export interface BrainGlossaryListResponse {
  items: BrainGlossaryListRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Full term row returned by `GET /api/portal/brain/glossary/[id]`. */
export interface BrainGlossaryTermRow {
  id: number;
  clientId: number;
  term: string;
  slug: string;
  definition: string;
  shortDefinition: string | null;
  aliases: string[];
  status: BrainGlossaryStatus;
  category: string | null;
  ownerId: number | null;
  relatedTermIds: number[];
  source: string;
  reviewItemId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrainGlossaryRelatedTerm {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
}

/** Wire response of `GET /api/portal/brain/glossary/[id]`. */
export interface BrainGlossaryTermDetail {
  term: BrainGlossaryTermRow;
  relatedTerms: BrainGlossaryRelatedTerm[];
}

export type BrainSearchEntityType =
  | 'meeting'
  | 'note'
  | 'task'
  | 'relationship'
  | 'company'
  | 'contact'
  | 'deal'
  | 'post'
  | 'decision'
  | 'glossary'
  | 'person';

export interface BrainSearchHit {
  type: BrainSearchEntityType;
  id: number;
  title: string;
  snippet: string;
  score: number;
  status?: string;
  occurredAt?: string;
  contextName?: string;
  url: string;
}

/** Wire response of `GET /api/portal/brain/search`. */
export interface BrainSearchResult {
  query: string;
  total: number;
  hits: BrainSearchHit[];
}

/**
 * Suggestions feed — the portal has no `/api/portal/brain/suggestions`
 * endpoint yet (Phase 4 explicitly does NOT add new sd2026 endpoints).
 * The hook in `lib/api/brain.ts` returns the existing mock array typed
 * through this shape so the screen does not import the mock directly.
 */
export interface BrainSuggestion {
  id: string;
  accent: string;
  bg: string;
  gradient?: boolean;
  icon: MIconProps['name'];
  eyebrow: string;
  title: string;
  body: string;
  cta1: string;
  cta2: string;
  /** Set when the server payload carries an associated entity — used by the
   *  suggestions screen to deep-link primary/secondary CTAs into the matching
   *  detail screen (decision / note / glossary). */
  entityType?: 'decision' | 'note' | 'glossary_term';
  entityId?: number;
}
