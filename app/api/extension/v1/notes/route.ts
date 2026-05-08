/**
 * POST /api/extension/v1/notes
 *
 * Create a Brain note from the browser extension. The extension's primary
 * "save this page" action lands here. Records `source: 'extension'` so we can
 * audit traffic by origin.
 *
 * Tenant-scoped: `clientId` always derived from the resolved API key context.
 */

import { z } from 'zod';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { createNote } from '@/lib/brain/notes';

export const runtime = 'nodejs';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().max(50_000).default(''),
  tags: z.array(z.string()).max(50).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  contactId: z.number().int().positive().optional(),
  companyId: z.number().int().positive().optional(),
  dealId: z.number().int().positive().optional(),
  pinned: z.boolean().optional(),
});

const handler = withExtensionAuth(async (req, ctx) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return extensionError('Invalid JSON body');
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return extensionError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const input = parsed.data;

  const note = await createNote({
    clientId: ctx.client.id,
    title: input.title,
    body: input.body,
    tags: input.tags,
    sourceUrl: input.sourceUrl ?? null,
    contactId: input.contactId,
    companyId: input.companyId,
    dealId: input.dealId,
    pinned: input.pinned,
    // 'extension' is a new provenance value alongside 'manual' / 'ai_review' /
    // 'document_import' / 'crawl'. The DB column is varchar(50), so the value
    // is permitted at runtime; the typed union in lib/brain/notes.ts is
    // narrower for backwards-compat with existing callers — cast here.
    source: 'extension' as never,
    createdBy: ctx.userId,
  });

  return extensionOk(note, { status: 201 });
});

export { handler as POST, handler as OPTIONS };
