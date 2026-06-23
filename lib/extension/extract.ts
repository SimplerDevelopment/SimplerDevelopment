/**
 * AI-driven page extraction for the SimplerDevelopment browser extension.
 *
 * Given the page text + URL + title, asks Claude Haiku for a cheap, fast
 * structured summary (summary, tags, entities, suggestedNote), then enriches
 * that with a server-side DB lookup for related CRM contacts/companies and
 * Brain notes. The model is never asked to invent IDs — it only gives names
 * and (best-effort) emails/domains; we resolve those against the tenant's
 * actual records here.
 *
 * Multi-tenant: every DB query is scoped by `clientId`. The Anthropic key is
 * resolved per-tenant via `resolveClientApiKey` so BYOK clients pay their own
 * provider.
 */

import { z } from 'zod';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts } from '@/lib/db/schema';
import { completeObject } from '@/lib/ai/llm';
import { searchBrain } from '@/lib/brain/search';

/** Hard cap on inbound text — anything longer is truncated before the model sees it. */
const MAX_TEXT_CHARS = 12_000;

const personSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
});

const companySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  description: z.string().optional(),
});

const extractionSchema = z.object({
  summary: z.string().min(1),
  tags: z.array(z.string()).max(10).default([]),
  entities: z.object({
    people: z.array(personSchema).default([]),
    companies: z.array(companySchema).default([]),
  }).default({ people: [], companies: [] }),
  suggestedNote: z.object({
    title: z.string().min(1),
    body: z.string().default(''),
    tags: z.array(z.string()).max(10).default([]),
  }),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

export interface RelatedRecords {
  contacts: Array<{
    id: number;
    firstName: string;
    lastName: string | null;
    email: string | null;
    title: string | null;
    companyId: number | null;
  }>;
  companies: Array<{
    id: number;
    name: string;
    domain: string | null;
    industry: string | null;
  }>;
  notes: Array<{
    id: number;
    title: string;
    snippet: string;
    url: string;
  }>;
}

export interface ExtractInput {
  clientId: number;
  url: string;
  title: string;
  text: string;
  /** Optional HTML — currently ignored (size-prohibitive). Plumbed for future use. */
  html?: string;
}

const SYSTEM_PROMPT = `You are a structured extraction assistant for a CRM/knowledge-base browser extension.

Given a web page (URL, title, plain text), return STRICT JSON ONLY — no prose, no markdown fences — matching this exact schema:

{
  "summary": "2-3 sentence neutral summary of what this page is about",
  "tags": ["3-6 short kebab-case tags relevant to filing this in a knowledge base"],
  "entities": {
    "people":   [{ "name": "Full Name", "email": "optional@example.com", "title": "optional job title", "company": "optional company name" }],
    "companies":[{ "name": "Company Name", "domain": "optional.example.com", "description": "optional 1-line" }]
  },
  "suggestedNote": {
    "title": "A short note title appropriate for a CRM/Brain note",
    "body":  "A markdown body that captures the salient takeaways the user would want to remember. Use bullet points where natural. Do not include the raw page text verbatim.",
    "tags":  ["3-6 short kebab-case tags"]
  }
}

Rules:
- Output JSON ONLY. No backticks, no explanation, no leading/trailing prose.
- If a field is unknown, omit it (or use an empty array). Never invent emails, domains, or job titles.
- Tags are short, lowercase, kebab-case. No spaces, no leading "#".
- Keep summary under 400 characters; suggestedNote.body under 4000 characters.`;

function buildUserPrompt(input: ExtractInput): string {
  const text = input.text.slice(0, MAX_TEXT_CHARS);
  return `URL: ${input.url}
TITLE: ${input.title}

PAGE TEXT (truncated to ${MAX_TEXT_CHARS} chars):
${text}`;
}

async function callModel(input: ExtractInput): Promise<ExtractionResult> {
  const { object } = await completeObject({
    task: 'extensionExtract',
    clientId: input.clientId,
    maxTokens: 1500,
    system: SYSTEM_PROMPT,
    schema: extractionSchema,
    prompt: buildUserPrompt(input),
  });
  return object;
}

/**
 * Server-side enrichment pass — given the entities the model surfaced, query
 * the tenant's CRM + Brain for matching records. Capped to 3 hits per bucket
 * so the response stays small.
 *
 * Always tenant-scoped on `clientId`.
 */
async function enrichRelated(
  clientId: number,
  pageTitle: string,
  extraction: ExtractionResult,
): Promise<RelatedRecords> {
  const contactSet = new Map<number, RelatedRecords['contacts'][number]>();
  const companySet = new Map<number, RelatedRecords['companies'][number]>();

  // People → contacts
  for (const person of extraction.entities.people.slice(0, 5)) {
    const rows = await db.select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      title: crmContacts.title,
      companyId: crmContacts.companyId,
    }).from(crmContacts)
      .where(and(
        eq(crmContacts.clientId, clientId),
        person.email
          ? or(
              sql`lower(${crmContacts.email}) = ${person.email.toLowerCase()}`,
              ilike(crmContacts.lastName, `%${person.name.split(/\s+/).slice(-1)[0] ?? person.name}%`),
            )
          : ilike(crmContacts.lastName, `%${person.name.split(/\s+/).slice(-1)[0] ?? person.name}%`),
      ))
      .limit(3);
    for (const r of rows) contactSet.set(r.id, r);
  }

  // Companies → CRM companies
  for (const company of extraction.entities.companies.slice(0, 5)) {
    const rows = await db.select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
    }).from(crmCompanies)
      .where(and(
        eq(crmCompanies.clientId, clientId),
        company.domain
          ? or(
              sql`lower(${crmCompanies.domain}) = ${company.domain.toLowerCase()}`,
              ilike(crmCompanies.name, `%${company.name}%`),
            )
          : ilike(crmCompanies.name, `%${company.name}%`),
      ))
      .limit(3);
    for (const r of rows) companySet.set(r.id, r);
  }

  // Related Brain notes — keyed off the page title.
  let notes: RelatedRecords['notes'] = [];
  try {
    const search = await searchBrain(clientId, pageTitle, { types: ['note'], limit: 3 });
    notes = search.hits.map((h) => ({
      id: h.id,
      title: h.title,
      snippet: h.snippet.slice(0, 200),
      url: h.url,
    }));
  } catch (err) {
    // Search failures should never break the extract endpoint.
    console.warn('[extension.extract] note search failed', err);
  }

  return {
    contacts: Array.from(contactSet.values()).slice(0, 6),
    companies: Array.from(companySet.values()).slice(0, 6),
    notes,
  };
}

export interface ExtractResponse extends ExtractionResult {
  relatedRecords: RelatedRecords;
}

/**
 * Top-level extraction entry-point. Returns the model output plus the
 * server-resolved `relatedRecords`. Throws on model/parse failure — callers
 * should catch and surface a 502.
 */
export async function extractFromPage(input: ExtractInput): Promise<ExtractResponse> {
  const extraction = await callModel(input);
  const relatedRecords = await enrichRelated(input.clientId, input.title, extraction);
  return { ...extraction, relatedRecords };
}

/** Re-export for testing. */
export const __test__ = { extractionSchema };
