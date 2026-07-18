/**
 * GET /api/extension/v1/notes/related?url={url}&limit={n}
 *
 * Find Brain notes that already exist for this URL (exact) and for any URL on
 * the same domain (domain). Powers the "you've already saved this" badge in
 * the extension popup so users don't accidentally double-save the same page.
 *
 * Tenant-scoped via the API key context.
 */

import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { getNoteBySourceUrl, listNotes, type BrainNote } from '@/lib/brain/notes';

export const runtime = 'nodejs';

function slim(note: BrainNote) {
  const snippet = (note.body ?? '').slice(0, 160).replace(/\s+/g, ' ').trim();
  return {
    id: note.id,
    title: note.title,
    snippet,
    tags: note.tags ?? [],
    sourceUrl: note.sourceUrl,
    createdAt: note.createdAt,
  };
}

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const target = url.searchParams.get('url')?.trim();
  if (!target) return extensionError('Missing required `url` query parameter');

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return extensionError('`url` is not a valid URL');
  }

  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10) || 10));

  // Exact URL match — single result wrapped to array for consistency.
  const exactMatch = await getNoteBySourceUrl(ctx.client.id, target);
  const exact = exactMatch ? [slim(exactMatch)] : [];

  // Same-origin matches, excluding the exact URL above.
  const origin = `${parsed.protocol}//${parsed.host}`;
  // Pull a generous window so we can drop the exact match before slicing to limit.
  // `includeBody: true` because the extension's "you've already saved this"
  // popup renders a 160-char snippet of each match. The default slim list
  // projection drops body markdown to keep the portal sidebar cheap.
  const domainNotes = await listNotes(ctx.client.id, {
    sourceUrlStartsWith: origin,
    limit: limit + 1,
    includeBody: true,
  });
  const domain = domainNotes
    .filter((n) => !exactMatch || n.id !== exactMatch.id)
    .slice(0, limit)
    .map(slim);

  return extensionOk({ exact, domain });
});

export { handler as GET, handler as OPTIONS };
