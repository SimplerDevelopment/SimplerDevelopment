/**
 * Survey response filter helpers (RESP-01).
 *
 * Shared by GET /api/portal/surveys/[id]/responses and the CSV export route
 * so the JSON list and the CSV download apply the exact same filters.
 *
 * Supported query params:
 *   - from=YYYY-MM-DD  inclusive lower bound on createdAt
 *   - to=YYYY-MM-DD    inclusive upper bound on createdAt (treated as end-of-day)
 *   - source=link|email|embed|crm|booking  exact match on source column
 *   - q=<keyword>      case-insensitive substring search across answer values
 *
 * The keyword search uses LOWER(answers::text) LIKE '%kw%' — fast enough for
 * the per-survey scale we expect, doesn't need a tsvector index, and finds
 * matches inside any nested answer value (string, number, array element).
 */
import { and, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { surveyResponses } from '@/lib/db/schema';

export interface ResponseFilters {
  from: string | null;     // 'YYYY-MM-DD' or null
  to: string | null;       // 'YYYY-MM-DD' or null
  source: string | null;   // exact match against survey_responses.source
  q: string | null;        // raw keyword (will be lowercased + LIKE-escaped)
}

/** Canonical source values that the schema documents. Surfaced to the UI as
 *  the dropdown options so users see every legitimate source even when no
 *  responses with that source have been collected yet. */
export const KNOWN_SOURCES = ['link', 'email', 'embed', 'crm', 'booking'] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse the four filter params off a URL. Invalid values are silently
 *  dropped so a malformed share-link still loads the unfiltered list rather
 *  than throwing. */
export function parseResponseFilters(url: URL): ResponseFilters {
  const sp = url.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const source = sp.get('source');
  const q = sp.get('q');
  return {
    from: from && ISO_DATE_RE.test(from) ? from : null,
    to: to && ISO_DATE_RE.test(to) ? to : null,
    source: source && source.trim() ? source.trim() : null,
    q: q && q.trim() ? q.trim() : null,
  };
}

/** Escape `%` `_` `\` so they don't act as LIKE wildcards inside a user's
 *  keyword. The Postgres default LIKE escape character is backslash. */
function escapeLikeLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Build a Drizzle WHERE expression that AND's together survey scoping +
 *  the parsed filters. Returns the surveyId-only condition when no filters
 *  are set, so callers can use the result unconditionally. */
export function buildResponseWhere(surveyId: number, f: ResponseFilters): SQL {
  const clauses: SQL[] = [eq(surveyResponses.surveyId, surveyId)];

  if (f.from) {
    // Treat YYYY-MM-DD as start-of-day UTC.
    clauses.push(gte(surveyResponses.createdAt, new Date(`${f.from}T00:00:00.000Z`)));
  }
  if (f.to) {
    // Treat YYYY-MM-DD as end-of-day UTC so single-day ranges include the
    // entire day.
    clauses.push(lte(surveyResponses.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
  }
  if (f.source) {
    clauses.push(eq(surveyResponses.source, f.source));
  }
  if (f.q) {
    const needle = `%${escapeLikeLiteral(f.q.toLowerCase())}%`;
    // LOWER(answers::text) LIKE :needle catches matches inside any
    // jsonb value (strings, numeric literals, array members).
    clauses.push(sql`LOWER(${surveyResponses.answers}::text) LIKE ${needle}`);
  }

  return and(...clauses) as SQL;
}
