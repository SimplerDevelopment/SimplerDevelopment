// Typed client for the SimplerDevelopment portal /api/extension/v1 endpoints.
// Reads creds from chrome.storage.local on every call so the user can update
// them in the options page without reloading the popup.

import { z } from 'zod';
import { getConfig } from './storage';
import {
  ApiError,
  ApiSuccess,
  AuthTestSchema,
  BrainTaskListSchema,
  BrainTaskRowSchema,
  CompanyListSchema,
  CompanyRowSchema,
  ContactListSchema,
  ContactRowSchema,
  DealListSchema,
  ExtractSchema,
  NoteSchema,
  NotesRelatedSchema,
  RecentActivitySchema,
  RelatedRecordsByUrlSchema,
  SearchResultsSchema,
  TagListSchema,
} from './types';
import type {
  AuthTest,
  BrainTaskList,
  BrainTaskRow,
  CompanyList,
  CompanyRow,
  ContactList,
  ContactRow,
  DealList,
  Extract,
  Note,
  NotesRelated,
  RecentActivity,
  RelatedRecordsByUrl,
  SearchResults,
  TagList,
} from './types';

export class ApiNotConfiguredError extends Error {
  constructor() {
    super('Extension is not configured. Open the options page to set your portal URL and API key.');
    this.name = 'ApiNotConfiguredError';
  }
}

export class ApiAuthError extends Error {
  constructor(msg = 'Invalid API key.') {
    super(msg);
    this.name = 'ApiAuthError';
  }
}

export class ApiNetworkError extends Error {
  constructor(msg = "Couldn't reach portal. Check your portal URL.") {
    super(msg);
    this.name = 'ApiNetworkError';
  }
}

export class ApiResponseError extends Error {
  constructor(msg: string, public status?: number) {
    super(msg);
    this.name = 'ApiResponseError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
  // Optional override for one-shot calls (e.g. from the options page Test button)
  override?: { portalUrl: string; apiKey: string };
}

function buildUrl(base: string, path: string, query?: RequestOpts['query']): string {
  const url = new URL(`${base}/api/extension/v1${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request<S extends z.ZodTypeAny>(
  schema: S,
  path: string,
  opts: RequestOpts = {}
): Promise<z.output<S>> {
  let cfg: { portalUrl: string; apiKey: string } | null = opts.override ?? null;
  if (!cfg) {
    const stored = await getConfig();
    if (!stored) throw new ApiNotConfiguredError();
    cfg = { portalUrl: stored.portalUrl, apiKey: stored.apiKey };
  }
  if (!cfg.portalUrl || !cfg.apiKey) throw new ApiNotConfiguredError();

  const url = buildUrl(cfg.portalUrl, path, opts.query);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Accept': 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    throw new ApiNetworkError(
      err instanceof Error ? err.message : "Couldn't reach portal."
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (res.status === 401 || res.status === 403) throw new ApiAuthError();
    throw new ApiResponseError(
      `Portal returned non-JSON response (HTTP ${res.status}).`,
      res.status
    );
  }

  if (!res.ok) {
    const errParsed = ApiError.safeParse(json);
    const message =
      errParsed.success ? errParsed.data.message : `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new ApiAuthError(message);
    throw new ApiResponseError(message, res.status);
  }

  // expect { success: true, data: T }
  const envelope = ApiSuccess(schema).safeParse(json);
  if (!envelope.success) {
    const errParsed = ApiError.safeParse(json);
    if (errParsed.success) {
      if (res.status === 401 || res.status === 403) throw new ApiAuthError(errParsed.data.message);
      throw new ApiResponseError(errParsed.data.message, res.status);
    }
    throw new ApiResponseError('Unexpected response shape from portal.');
  }
  return envelope.data.data;
}

// --- Public API ------------------------------------------------------------

export const api = {
  authTest(override?: { portalUrl: string; apiKey: string }): Promise<AuthTest> {
    return request(AuthTestSchema, '/auth/test', { method: 'POST', override });
  },

  createNote(input: {
    title: string;
    body: string;
    tags?: string[];
    sourceUrl?: string;
    contactId?: string | number | null;
    companyId?: string | number | null;
    dealId?: string | number | null;
    pinned?: boolean;
  }): Promise<Note> {
    return request(NoteSchema, '/notes', { method: 'POST', body: input });
  },

  notesRelated(url: string, limit = 5): Promise<NotesRelated> {
    return request(NotesRelatedSchema, '/notes/related', { query: { url, limit } });
  },

  relatedRecordsByUrl(url: string): Promise<RelatedRecordsByUrl> {
    return request(RelatedRecordsByUrlSchema, '/related-records', { query: { url } });
  },

  extract(input: { url: string; title: string; text: string; html?: string }): Promise<Extract> {
    return request(ExtractSchema, '/extract', { method: 'POST', body: input });
  },

  search(q: string, limit = 10): Promise<SearchResults> {
    return request(SearchResultsSchema, '/search', { query: { q, limit } });
  },

  createContact(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
    companyId?: string | number | null;
    displayName?: string;
    source?: string;
  }): Promise<ContactRow> {
    return request(ContactRowSchema, '/crm/contacts', { method: 'POST', body: input });
  },

  searchContacts(search: string, limit = 8): Promise<ContactList> {
    return request(ContactListSchema, '/crm/contacts', { query: { search, limit } });
  },

  createCompany(input: {
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    phone?: string;
    address?: string;
    website?: string;
    logoUrl?: string;
  }): Promise<CompanyRow> {
    return request(CompanyRowSchema, '/crm/companies', { method: 'POST', body: input });
  },

  searchCompanies(search: string, limit = 8): Promise<CompanyList> {
    return request(CompanyListSchema, '/crm/companies', { query: { search, limit } });
  },

  listDeals(status: 'open' | 'all' = 'open', limit = 20): Promise<DealList> {
    return request(DealListSchema, '/crm/deals', { query: { status, limit } });
  },

  createTask(input: {
    title: string;
    body?: string;
    dueAt?: string;
    sourceUrl?: string;
    contactId?: string | number | null;
    companyId?: string | number | null;
    dealId?: string | number | null;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<BrainTaskRow> {
    return request(BrainTaskRowSchema, '/tasks', { method: 'POST', body: input });
  },

  listTasks(status: 'open' | 'all' = 'open', limit = 20): Promise<BrainTaskList> {
    return request(BrainTaskListSchema, '/tasks', { query: { status, limit } });
  },

  listTags(prefix: string, limit = 12): Promise<TagList> {
    return request(TagListSchema, '/tags', { query: { prefix, limit } });
  },

  recentActivity(limit = 10, days = 14): Promise<RecentActivity> {
    return request(RecentActivitySchema, '/activity/recent', { query: { limit, days } });
  },
};
