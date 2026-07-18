/**
 * POST /api/extension/v1/extract
 *
 * AI extraction from page content — the extension sends the URL/title/text
 * and we return a structured `{ summary, tags, entities, suggestedNote,
 * relatedRecords }` payload powered by Claude Haiku. See
 * `lib/extension/extract.ts` for the model + enrichment logic.
 */

import { z } from 'zod';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { extractFromPage } from '@/lib/extension/extract';

export const runtime = 'nodejs';
// Extraction is AI-bound and can take several seconds.
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(500),
  text: z.string().max(200_000),
  html: z.string().max(500_000).optional(),
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

  try {
    const result = await extractFromPage({
      clientId: ctx.client.id,
      url: parsed.data.url,
      title: parsed.data.title,
      text: parsed.data.text,
      html: parsed.data.html,
    });
    return extensionOk(result);
  } catch (err) {
    console.error('[extension.extract] failed', err);
    return extensionError('AI extraction failed', 502);
  }
});

export { handler as POST, handler as OPTIONS };
