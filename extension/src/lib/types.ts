import { z } from 'zod';

// --- API envelope ----------------------------------------------------------

export const ApiSuccess = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ success: z.literal(true), data: schema });

export const ApiError = z.object({
  success: z.literal(false),
  message: z.string(),
});
export type ApiErrorShape = z.infer<typeof ApiError>;

// --- Auth ------------------------------------------------------------------

export const AuthTestSchema = z.object({
  user: z.object({
    id: z.union([z.string(), z.number()]),
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  }),
  client: z.object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
  }),
});
export type AuthTest = z.infer<typeof AuthTestSchema>;

// --- Notes -----------------------------------------------------------------

export const SlimNoteSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  snippet: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});
export type SlimNote = z.infer<typeof SlimNoteSchema>;

export const NoteSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    body: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .passthrough();
export type Note = z.infer<typeof NoteSchema>;

export const NotesRelatedSchema = z.object({
  exact: z.array(SlimNoteSchema).default([]),
  domain: z.array(SlimNoteSchema).default([]),
});
export type NotesRelated = z.infer<typeof NotesRelatedSchema>;

// --- Extract ---------------------------------------------------------------

export const ExtractedPersonSchema = z.object({
  name: z.string(),
  email: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
});
export type ExtractedPerson = z.infer<typeof ExtractedPersonSchema>;

export const ExtractedCompanySchema = z.object({
  name: z.string(),
  domain: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type ExtractedCompany = z.infer<typeof ExtractedCompanySchema>;

export const RelatedNoteSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  snippet: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});
export type RelatedNote = z.infer<typeof RelatedNoteSchema>;

export const RelatedContactSchema = z.object({
  id: z.union([z.string(), z.number()]),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  companyId: z.union([z.string(), z.number()]).nullable().optional(),
});
export type RelatedContact = z.infer<typeof RelatedContactSchema>;

export const RelatedCompanySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
});
export type RelatedCompany = z.infer<typeof RelatedCompanySchema>;

export const ExtractSchema = z.object({
  summary: z.string().default(''),
  tags: z.array(z.string()).default([]),
  entities: z
    .object({
      people: z.array(ExtractedPersonSchema).default([]),
      companies: z.array(ExtractedCompanySchema).default([]),
    })
    .default({ people: [], companies: [] }),
  suggestedNote: z
    .object({
      title: z.string().default(''),
      body: z.string().default(''),
      tags: z.array(z.string()).default([]),
    })
    .default({ title: '', body: '', tags: [] }),
  relatedRecords: z
    .object({
      contacts: z.array(RelatedContactSchema).default([]),
      companies: z.array(RelatedCompanySchema).default([]),
      notes: z.array(RelatedNoteSchema).default([]),
    })
    .default({ contacts: [], companies: [], notes: [] }),
});
export type Extract = z.infer<typeof ExtractSchema>;

// --- Search ----------------------------------------------------------------

const SearchContact = z.object({
  id: z.union([z.string(), z.number()]),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  companyId: z.union([z.string(), z.number()]).nullable().optional(),
  companyName: z.string().nullable().optional(),
});
const SearchCompany = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
});
const SearchDeal = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  stage: z.string().nullable().optional(),
  contactId: z.union([z.string(), z.number()]).nullable().optional(),
  companyId: z.union([z.string(), z.number()]).nullable().optional(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
});

export const SearchResultsSchema = z.object({
  notes: z.array(SlimNoteSchema).default([]),
  contacts: z.array(SearchContact).default([]),
  companies: z.array(SearchCompany).default([]),
  deals: z.array(SearchDeal).default([]),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;
export type SearchContact = z.infer<typeof SearchContact>;
export type SearchCompany = z.infer<typeof SearchCompany>;
export type SearchDeal = z.infer<typeof SearchDeal>;

// --- Related records by URL (deal-aware capture) --------------------------

export const RelatedRecordsByUrlSchema = z.object({
  host: z.string().nullable().optional(),
  companies: z.array(SearchCompany).default([]),
  deals: z.array(SearchDeal).default([]),
  contacts: z.array(SearchContact).default([]),
});
export type RelatedRecordsByUrl = z.infer<typeof RelatedRecordsByUrlSchema>;

// --- CRM lists -------------------------------------------------------------

export const ContactListSchema = z.object({
  items: z.array(SearchContact).default([]),
});
export type ContactList = z.infer<typeof ContactListSchema>;

export const CompanyListSchema = z.object({
  items: z.array(SearchCompany).default([]),
});
export type CompanyList = z.infer<typeof CompanyListSchema>;

export const DealListSchema = z.object({
  items: z.array(SearchDeal).default([]),
});
export type DealList = z.infer<typeof DealListSchema>;

export const ContactRowSchema = z.object({
  id: z.union([z.string(), z.number()]),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  companyId: z.union([z.string(), z.number()]).nullable().optional(),
});
export type ContactRow = z.infer<typeof ContactRowSchema>;

export const CompanyRowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    domain: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    _existing: z.boolean().optional(),
  })
  .passthrough();
export type CompanyRow = z.infer<typeof CompanyRowSchema>;

// --- Brain tasks -----------------------------------------------------------

export const BrainTaskRowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
  })
  .passthrough();
export type BrainTaskRow = z.infer<typeof BrainTaskRowSchema>;

export const SlimTaskSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  dueAt: z.string().nullable().optional(),
  status: z.string(),
  sourceUrl: z.string().nullable().optional(),
  contactId: z.union([z.string(), z.number()]).nullable().optional(),
  companyId: z.union([z.string(), z.number()]).nullable().optional(),
  dealId: z.union([z.string(), z.number()]).nullable().optional(),
});
export type SlimTask = z.infer<typeof SlimTaskSchema>;

export const BrainTaskListSchema = z.object({
  items: z.array(SlimTaskSchema).default([]),
});
export type BrainTaskList = z.infer<typeof BrainTaskListSchema>;

// --- Tags ------------------------------------------------------------------

export const TagListSchema = z.object({
  items: z
    .array(
      z.object({
        tag: z.string(),
        count: z.union([z.string(), z.number()]),
      }),
    )
    .default([]),
});
export type TagList = z.infer<typeof TagListSchema>;

// --- Recent activity -------------------------------------------------------

export const RecentContactSchema = z.object({
  id: z.union([z.string(), z.number()]),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});
export type RecentContact = z.infer<typeof RecentContactSchema>;

export const RecentCompanySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  domain: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});
export type RecentCompany = z.infer<typeof RecentCompanySchema>;

export const RecentActivitySchema = z.object({
  notes: z.array(SlimNoteSchema).default([]),
  contacts: z.array(RecentContactSchema).default([]),
  companies: z.array(RecentCompanySchema).default([]),
});
export type RecentActivity = z.infer<typeof RecentActivitySchema>;
