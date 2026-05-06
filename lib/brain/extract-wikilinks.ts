import { db } from '@/lib/db';
import { brainNotes, brainKbLinks } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export interface ParsedWikiLink {
  rawTarget: string;
  anchor: string | null;
  displayText: string | null;
  linkType: 'wikilink' | 'embed';
}

const WIKILINK_RE = /(!?)\[\[([^\]]+)\]\]/g;

export function parseWikiLinks(body: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  if (!body) return links;
  body.replace(WIKILINK_RE, (_match, bang: string, inner: string) => {
    let target = inner;
    let anchor: string | null = null;
    let displayText: string | null = null;
    const pipeIdx = target.indexOf('|');
    if (pipeIdx >= 0) {
      displayText = target.slice(pipeIdx + 1).trim();
      target = target.slice(0, pipeIdx);
    }
    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      anchor = target.slice(hashIdx + 1).trim();
      target = target.slice(0, hashIdx);
    }
    target = target.trim();
    if (target.length > 0) {
      links.push({
        rawTarget: target,
        anchor,
        displayText,
        linkType: bang === '!' ? 'embed' : 'wikilink',
      });
    }
    return '';
  });
  return links;
}

export async function extractAndSyncWikiLinks(
  clientId: number,
  noteId: number,
  body: string,
): Promise<void> {
  const parsed = parseWikiLinks(body);

  await db.delete(brainKbLinks).where(
    and(eq(brainKbLinks.clientId, clientId), eq(brainKbLinks.fromNoteId, noteId)),
  );

  if (parsed.length === 0) return;

  const targets = Array.from(new Set(parsed.map((p) => p.rawTarget.toLowerCase())));
  const titleRows = targets.length > 0
    ? await db.select({ id: brainNotes.id, title: brainNotes.title }).from(brainNotes)
        .where(and(
          eq(brainNotes.clientId, clientId),
          sql`lower(${brainNotes.title}) IN (${sql.join(targets.map((t) => sql`${t}`), sql`, `)})`,
        ))
    : [];

  const idByTitle = new Map<string, number>();
  for (const r of titleRows) idByTitle.set(r.title.toLowerCase(), r.id);

  const rows = parsed.map((link) => ({
    clientId,
    fromNoteId: noteId,
    toNoteId: idByTitle.get(link.rawTarget.toLowerCase()) ?? null,
    rawTarget: link.rawTarget.slice(0, 500),
    anchor: link.anchor ? link.anchor.slice(0, 255) : null,
    displayText: link.displayText ? link.displayText.slice(0, 500) : null,
    linkType: link.linkType,
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(brainKbLinks).values(rows.slice(i, i + BATCH));
  }
}
