/**
 * One-shot import of the postcaptain-kb Obsidian vault into Brain.
 *
 *   bun run scripts/migrations/postcaptain/import-kb.ts \
 *     [--vault=/path/to/postcaptain-kb] [--limit=N] [--skip-embed] [--dry-run]
 *
 *   --vault       Path to the local Obsidian vault. Default ~/Obsidian/postcaptain-kb.
 *   --limit       Cap on number of files to process (for testing).
 *   --skip-embed  Import notes + parse links, but don't call OpenAI.
 *   --dry-run     Parse + report stats only — no DB writes.
 *
 * Idempotent on (clientId, sourceUrl): re-running updates the existing note
 * and replaces its embeddings + outbound links.
 *
 * Provenance: each note is tagged with its top-level vault folder
 * ('competitor', 'technolutions-kb', 'discovery', 'postcaptain', 'index',
 * 'daily', 'sources-other') so search results can be filtered by origin.
 *
 * Cost: full vault import is ~$0.08 in OpenAI text-embedding-3-small charges.
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_CAPTAIN_CLIENT_ID = 100;
const DEFAULT_VAULT = path.join(process.env.HOME ?? '', 'Obsidian/postcaptain-kb');

interface Args {
  vault: string;
  limit: number | null;
  skipEmbed: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args: Args = { vault: DEFAULT_VAULT, limit: null, skipEmbed: false, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--vault=')) args.vault = arg.slice('--vault='.length);
    else if (arg.startsWith('--limit=')) args.limit = parseInt(arg.slice('--limit='.length), 10);
    else if (arg === '--skip-embed') args.skipEmbed = true;
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

interface ParsedNote {
  /** Vault-relative path with .md, used as sourceUrl for dedup. */
  relativePath: string;
  /** Cleaned-up title — frontmatter `title` || first H1 || filename. */
  title: string;
  /** Body markdown after frontmatter strip + cleanup. */
  body: string;
  /** Top-level folder tag for filtering. */
  provenance: string;
  /** All Obsidian links found in the body. */
  links: ParsedLink[];
  /** Parsed frontmatter as a structured object — values can be string, number, boolean, or string[]. */
  frontmatter: Record<string, FrontmatterValue>;
}

type FrontmatterValue = string | number | boolean | string[] | null;

interface ParsedLink {
  rawTarget: string;
  anchor: string | null;
  displayText: string | null;
  linkType: 'wikilink' | 'embed';
}

/**
 * Pre-defined custom field types for KB notes. Values that appear in a note's
 * frontmatter under one of these keys get the typed treatment instead of
 * falling through to auto-derive (which always yields 'text').
 *
 * field_label is what shows in the UI; field_name is the snake_case key from
 * frontmatter. Anything not in this map gets auto-derived as 'text' (or the
 * deduced type if we can detect a date, number, or boolean).
 */
const KNOWN_NOTE_FIELDS: Record<string, {
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'url' | 'email' | 'tags' | 'boolean' | 'json';
  category: string;
  sortOrder: number;
  filterable?: boolean;
}> = {
  source_url_web:    { label: 'Source URL (web)',  type: 'url',      category: 'Provenance', sortOrder: 5 },
  scraped_at:        { label: 'Scraped at',        type: 'datetime', category: 'Provenance', sortOrder: 10 },
  content_hash:      { label: 'Content hash',      type: 'text',     category: 'Provenance', sortOrder: 20 },
  topic:             { label: 'Topic / query',     type: 'text',     category: 'Provenance', sortOrder: 30, filterable: true },
  original_filename: { label: 'Original filename', type: 'text',     category: 'Provenance', sortOrder: 40 },
  chunk_index:       { label: 'Chunk index',       type: 'number',   category: 'Provenance', sortOrder: 50 },
};

/**
 * Map an unknown frontmatter value to a guessed field type. Cheap heuristic:
 * arrays → tags, ISO 8601 → datetime, plain numbers → number, true/false →
 * boolean, anything else → text. Users can re-type later in the UI.
 */
function deduceFieldType(v: FrontmatterValue): 'text' | 'number' | 'date' | 'datetime' | 'tags' | 'boolean' {
  if (Array.isArray(v)) return 'tags';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'datetime';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  }
  return 'text';
}

/**
 * Frontmatter values that go to native brain_notes columns rather than
 * custom_field_values. Importer uses this to know what to skip when
 * populating custom fields.
 */
const NATIVE_COLUMN_KEYS = new Set(['title', 'source_url', 'tags', 'source']);

/**
 * Minimal YAML-ish parser tuned to Obsidian frontmatter shapes:
 *   key: value
 *   key: "value with spaces"
 *   key: [a, b, c]
 *   key:
 *     - a
 *     - b
 *   key: 2026-04-10T13:38:58+00:00
 * Not a full YAML implementation — handles only the patterns the vault
 * actually uses. Falls back to treating any unrecognized line's value as a
 * raw string.
 */
function parseFrontmatter(yaml: string): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^([a-zA-Z_][\w-]*?):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2].trim();

    if (rest === '' || rest === '|' || rest === '>') {
      // Multi-line block — collect indented continuation lines.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('\t'))) {
        const item = lines[j].replace(/^\s+/, '').replace(/^-\s*/, '');
        if (item) items.push(item);
        j++;
      }
      out[key] = items;
      i = j;
      continue;
    }

    if (rest.startsWith('[') && rest.endsWith(']')) {
      // Inline array: [a, b, c]
      const inner = rest.slice(1, -1);
      out[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      i++;
      continue;
    }

    // Strip surrounding quotes
    let value: FrontmatterValue = rest;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Type coercion
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value);

    // Decode escaped Unicode (e.g. \U0001F4BB) — common in scraper-emitted titles.
    if (typeof value === 'string' && value.includes('\\U')) {
      try {
        value = value.replace(/\\U([0-9A-Fa-f]{8})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
      } catch { /* leave as-is */ }
    }

    out[key] = value;
    i++;
  }
  return out;
}

function provenanceFor(relativePath: string): string {
  const segments = relativePath.split('/');
  const top = segments[0];
  if (top === 'sources') {
    const sub = segments[1] ?? 'other';
    if (sub === 'competitors') return 'competitor';
    if (sub === 'postcaptain') return 'postcaptain';
    if (sub === 'technolutions-kb') return 'technolutions-kb';
    if (sub === 'slate-news') return 'slate-news';
    if (sub === 'slate-org') return 'slate-org';
    return 'sources-other';
  }
  if (top === 'discoveries') return 'discovery';
  if (top === 'indexes') return 'index';
  if (top === 'daily') return 'daily';
  return top || 'unknown';
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const H1_RE = /^#\s+(.+)$/m;
const WIKILINK_RE = /(!?)\[\[([^\]]+)\]\]/g;

function parseNote(relativePath: string, raw: string): ParsedNote {
  // Strip frontmatter and parse it as YAML-ish structured data.
  let body = raw;
  let frontmatter: Record<string, FrontmatterValue> = {};
  const fmMatch = raw.match(FRONTMATTER_RE);
  if (fmMatch) {
    frontmatter = parseFrontmatter(fmMatch[1]);
    body = raw.slice(fmMatch[0].length);
  }

  // Title resolution: frontmatter > first H1 > filename.
  let title: string | null = null;
  if (typeof frontmatter.title === 'string') title = frontmatter.title;
  if (!title) {
    const h1 = body.match(H1_RE);
    if (h1) title = h1[1].trim();
  }
  if (!title) {
    const base = path.basename(relativePath, '.md');
    title = base;
  }

  // Extract Obsidian links. Matches both [[Target]] and ![[Embed]] variants
  // and supports [[Target#Heading|Display]] anchors and aliases.
  const links: ParsedLink[] = [];
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

  // Light cleanup — collapse runs of blank lines, normalize whitespace. Leave
  // the markdown structure intact (we want headings preserved for chunking).
  body = body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    relativePath,
    title: title.slice(0, 255),
    body,
    provenance: provenanceFor(relativePath),
    links,
    frontmatter,
  };
}

function walkVault(vaultRoot: string): string[] {
  const out: string[] = [];
  // Skip vault-level meta dirs and any non-content directories that commonly
  // sneak into KB repos (Python venvs, npm caches, etc.).
  const skip = new Set([
    '.git', '.obsidian', 'node_modules', '.trash',
    '.venv', 'venv', '__pycache__', '.idea', '.vscode',
  ]);
  // Also skip top-level repo metadata files that aren't real KB content.
  const skipFiles = new Set(['README.md', 'CLAUDE.md', 'HANDOFF.md', 'LICENSE.md']);
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = path.relative(vaultRoot, full);
        // Only skip top-level meta files (`README.md` at root). A nested
        // `competitor/Foo/README.md` is real content.
        if (!relPath.includes('/') && skipFiles.has(entry.name)) continue;
        out.push(relPath);
      }
    }
  }
  walk(vaultRoot);
  return out.sort();
}

async function run() {
  const args = parseArgs();
  console.log(`>> vault=${args.vault} limit=${args.limit ?? 'all'} dry-run=${args.dryRun} skip-embed=${args.skipEmbed}`);

  if (!fs.existsSync(args.vault)) {
    throw new Error(`vault not found: ${args.vault}`);
  }

  const allFiles = walkVault(args.vault);
  const files = args.limit ? allFiles.slice(0, args.limit) : allFiles;
  console.log(`>> found ${allFiles.length} markdown files; processing ${files.length}`);

  // Pass 1: parse all notes into memory. Cheap (12 MB total) and lets us
  // build the path-to-noteId map before resolving links.
  const parsed: ParsedNote[] = [];
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(args.vault, rel), 'utf8');
    if (raw.trim().length === 0) continue;
    parsed.push(parseNote(rel, raw));
  }

  // Stats
  const byProvenance = new Map<string, number>();
  let totalChars = 0;
  let totalLinks = 0;
  for (const n of parsed) {
    byProvenance.set(n.provenance, (byProvenance.get(n.provenance) ?? 0) + 1);
    totalChars += n.body.length;
    totalLinks += n.links.length;
  }
  console.log(`>> parsed ${parsed.length} notes, ${totalChars.toLocaleString()} chars, ${totalLinks} links`);
  console.log(`>> provenance:`);
  for (const [k, v] of [...byProvenance.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${k.padEnd(20)} ${v}`);
  }

  if (args.dryRun) {
    console.log('>> dry run — no DB writes');
    process.exit(0);
  }

  // Lazy-load DB modules so dry-run doesn't need a live connection.
  const { db } = await import('../../../lib/db');
  const { sql, eq, and } = await import('drizzle-orm');
  const { brainNotes, brainKbLinks, brainCustomFields, brainCustomFieldValues } = await import('../../../lib/db/schema');
  const { embedEntity } = await import('../../../lib/brain/embeddings');

  // Pass 2a: ensure custom field definitions exist. We seed:
  //   * every frontmatter key seen across the parsed set (typed-known or
  //     auto-derived based on value shape);
  //   * every entry in KNOWN_NOTE_FIELDS unconditionally, so synthetic fields
  //     (like 'original_filename') and fields used by some-but-not-all notes
  //     have definitions even if their values are populated later.
  console.log('>> seeding custom field definitions...');
  const allKeys = new Set<string>(Object.keys(KNOWN_NOTE_FIELDS));
  // 'source_url_web' is added per-note when frontmatter has a web URL — seed it here.
  allKeys.add('source_url_web');
  const unknownKeyTypes = new Map<string, ReturnType<typeof deduceFieldType>>();
  for (const n of parsed) {
    for (const [k, v] of Object.entries(n.frontmatter)) {
      if (NATIVE_COLUMN_KEYS.has(k)) continue;
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v === '') continue;
      allKeys.add(k);
      if (!KNOWN_NOTE_FIELDS[k] && !unknownKeyTypes.has(k)) {
        unknownKeyTypes.set(k, deduceFieldType(v));
      }
    }
  }

  // Upsert one definition per (clientId, 'note', fieldName).
  const fieldIdByName = new Map<string, number>();
  let knownDefs = 0;
  let derivedDefs = 0;
  for (const key of allKeys) {
    const known = KNOWN_NOTE_FIELDS[key];
    const def = known
      ? {
          fieldLabel: known.label,
          fieldType: known.type,
          category: known.category,
          sortOrder: known.sortOrder,
          filterable: known.filterable ?? false,
          source: 'manual' as const,
        }
      : {
          fieldLabel: key,
          fieldType: unknownKeyTypes.get(key) ?? 'text',
          category: 'Frontmatter',
          sortOrder: 1000,
          filterable: false,
          source: 'auto-derived' as const,
        };

    const existing = await db.select({ id: brainCustomFields.id }).from(brainCustomFields)
      .where(and(
        eq(brainCustomFields.clientId, POST_CAPTAIN_CLIENT_ID),
        eq(brainCustomFields.entityType, 'note'),
        eq(brainCustomFields.fieldName, key),
      ))
      .limit(1);
    let fieldId: number;
    if (existing.length > 0) {
      fieldId = existing[0].id;
    } else {
      const [created] = await db.insert(brainCustomFields).values({
        clientId: POST_CAPTAIN_CLIENT_ID,
        entityType: 'note',
        fieldName: key,
        ...def,
      }).returning({ id: brainCustomFields.id });
      fieldId = created.id;
      if (def.source === 'manual') knownDefs++; else derivedDefs++;
    }
    fieldIdByName.set(key, fieldId);
  }
  console.log(`>> custom fields: ${knownDefs} known + ${derivedDefs} auto-derived (${allKeys.size} total in registry)`);

  // Pass 2b: upsert brain_notes rows + custom field values per note.
  console.log('>> upserting notes...');
  const noteIdByPath = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  let valuesWritten = 0;

  // Serialize a frontmatter value to text for the value column. The shape
  // contract is fieldType-dependent (see embeddings/notes.ts).
  function serializeValue(v: FrontmatterValue): string | null {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }

  for (const n of parsed) {
    const sourceUrl = typeof n.frontmatter.source_url === 'string' && n.frontmatter.source_url
      ? n.frontmatter.source_url
      : `vault://postcaptain-kb/${n.relativePath}`;
    const vaultPath = `vault://postcaptain-kb/${n.relativePath}`;

    // Merge frontmatter `tags` array (if any) into the structured tag list.
    // Always-present tags for KB-imported notes: 'kb-import' + provenance.
    const tagSet = new Set<string>(['kb-import', n.provenance]);
    if (Array.isArray(n.frontmatter.tags)) {
      for (const t of n.frontmatter.tags) {
        if (typeof t === 'string' && t.trim()) tagSet.add(t.trim());
      }
    }
    const tags = Array.from(tagSet);

    // Dedupe on the vault path (not source_url) so a re-run finds the same
    // note even if the original source URL changed.
    const existing = await db.select({ id: brainNotes.id }).from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, POST_CAPTAIN_CLIENT_ID),
        eq(brainNotes.sourceUrl, vaultPath),
      ))
      .limit(1);

    let noteId: number;
    if (existing.length > 0) {
      noteId = existing[0].id;
      await db.update(brainNotes).set({
        title: n.title,
        body: n.body.slice(0, 50_000),
        tags,
        source: 'document_import',
        sourceUrl: vaultPath,
        updatedAt: new Date(),
      }).where(eq(brainNotes.id, noteId));
      updated++;
    } else {
      const [created] = await db.insert(brainNotes).values({
        clientId: POST_CAPTAIN_CLIENT_ID,
        title: n.title,
        body: n.body.slice(0, 50_000),
        tags,
        confidentialityLevel: 'standard',
        source: 'document_import',
        sourceUrl: vaultPath,
      }).returning({ id: brainNotes.id });
      noteId = created.id;
      inserted++;
    }
    noteIdByPath.set(n.relativePath, noteId);

    // Write custom field values. Always include original_filename (the
    // vault-relative path) so vault-side backlinks are easy to construct
    // even when frontmatter doesn't carry it. Prefer the resolved web URL
    // for source_url over the vault path.
    const valueRows: Array<{ key: string; value: string | null }> = [];
    for (const [k, v] of Object.entries(n.frontmatter)) {
      if (NATIVE_COLUMN_KEYS.has(k)) continue;
      const serialized = serializeValue(v);
      if (serialized === null) continue;
      valueRows.push({ key: k, value: serialized });
    }
    // Synthetic field: original vault path (independent of frontmatter).
    // Definition seeded in pass 2a; here we just queue the value.
    if (!valueRows.some(r => r.key === 'original_filename')) {
      valueRows.push({ key: 'original_filename', value: n.relativePath });
    }
    // When the note has a real web source URL (not a vault:// path), record
    // it under source_url_web so search/UI can deep-link back to the origin.
    // Definition seeded in pass 2a.
    if (sourceUrl !== vaultPath) {
      valueRows.push({ key: 'source_url_web', value: sourceUrl });
    }

    for (const row of valueRows) {
      const fieldId = fieldIdByName.get(row.key);
      if (!fieldId) continue;
      // Upsert via ON CONFLICT on the unique (custom_field_id, entity_id) index.
      await db.execute(sql`
        INSERT INTO brain_custom_field_values (custom_field_id, entity_type, entity_id, value)
        VALUES (${fieldId}, 'note', ${noteId}, ${row.value})
        ON CONFLICT (custom_field_id, entity_id)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `);
      valuesWritten++;
    }

  }
  console.log(`>> notes: ${inserted} inserted, ${updated} updated, ${valuesWritten} custom field values written`);

  // Pass 3: rebuild link graph. Drop existing edges from these notes, then
  // re-insert. Resolve [[Target]] strings to noteIds via fuzzy matching:
  //   exact path match > basename match > null (orphan link).
  console.log('>> rebuilding link graph...');
  const allNoteIds = [...noteIdByPath.values()];
  if (allNoteIds.length > 0) {
    await db.execute(sql`
      DELETE FROM brain_kb_links
      WHERE client_id = ${POST_CAPTAIN_CLIENT_ID}
        AND from_note_id IN (${sql.raw(allNoteIds.join(','))})
    `);
  }

  // Build a basename-indexed lookup for unqualified [[Note Name]] resolution.
  const basenameIndex = new Map<string, number[]>();
  for (const [relPath, noteId] of noteIdByPath.entries()) {
    const base = path.basename(relPath, '.md').toLowerCase();
    const list = basenameIndex.get(base) ?? [];
    list.push(noteId);
    basenameIndex.set(base, list);
  }

  function resolveLink(rawTarget: string, sourceFilePath: string): number | null {
    const target = rawTarget.trim();
    // Exact relative-path match (with or without .md).
    const candidates = [
      target,
      `${target}.md`,
      // Same-directory relative
      path.posix.join(path.dirname(sourceFilePath), target),
      path.posix.join(path.dirname(sourceFilePath), `${target}.md`),
    ];
    for (const c of candidates) {
      const id = noteIdByPath.get(c);
      if (id) return id;
    }
    // Basename-only fallback. If multiple notes share a basename, take the
    // first; Obsidian's own resolution does roughly the same.
    const baseHits = basenameIndex.get(target.toLowerCase());
    if (baseHits && baseHits.length > 0) return baseHits[0];
    return null;
  }

  let edgeCount = 0;
  let orphanCount = 0;
  // Bulk insert edges in chunks of 500 to avoid massive single-statement IN clauses.
  const BATCH = 500;
  let buffer: Array<{
    clientId: number;
    fromNoteId: number;
    toNoteId: number | null;
    rawTarget: string;
    anchor: string | null;
    displayText: string | null;
    linkType: 'wikilink' | 'embed';
  }> = [];

  async function flush() {
    if (buffer.length === 0) return;
    await db.insert(brainKbLinks).values(buffer);
    buffer = [];
  }

  for (const n of parsed) {
    const fromId = noteIdByPath.get(n.relativePath);
    if (!fromId) continue;
    for (const link of n.links) {
      const toId = resolveLink(link.rawTarget, n.relativePath);
      if (toId === null) orphanCount++;
      buffer.push({
        clientId: POST_CAPTAIN_CLIENT_ID,
        fromNoteId: fromId,
        toNoteId: toId,
        rawTarget: link.rawTarget.slice(0, 500),
        anchor: link.anchor ? link.anchor.slice(0, 255) : null,
        displayText: link.displayText ? link.displayText.slice(0, 500) : null,
        linkType: link.linkType,
      });
      edgeCount++;
      if (buffer.length >= BATCH) await flush();
    }
  }
  await flush();
  console.log(`>> links: ${edgeCount} edges (${orphanCount} unresolved targets)`);

  // Pass 4: embed each note. Sequential for now — OpenAI batching is already
  // happening inside embedText. Could parallelize across notes later.
  if (args.skipEmbed) {
    console.log('>> --skip-embed set, skipping embeddings');
    process.exit(0);
  }

  console.log('>> embedding notes...');
  let embedded = 0;
  let chunksTotal = 0;
  let tokensTotal = 0;
  let lastReport = Date.now();
  for (const n of parsed) {
    const noteId = noteIdByPath.get(n.relativePath);
    if (!noteId) continue;
    try {
      const result = await embedEntity({
        clientId: POST_CAPTAIN_CLIENT_ID,
        entityType: 'note',
        entityId: noteId,
        content: `${n.title}\n\n${n.body}`,
      });
      embedded++;
      chunksTotal += result.chunks;
      tokensTotal += result.tokens;
      if (Date.now() - lastReport > 5000) {
        console.log(`     ${embedded}/${parsed.length} notes, ${chunksTotal} chunks, ${tokensTotal.toLocaleString()} tokens`);
        lastReport = Date.now();
      }
    } catch (err) {
      console.error(`     ! embed failed for ${n.relativePath}:`, err instanceof Error ? err.message : err);
    }
  }

  // Cost is reported per OpenAI's response, distributed across calls. Real
  // billing should match this within a few %.
  const estCost = (tokensTotal / 1_000_000) * 0.02;
  console.log(`>> embeddings: ${embedded}/${parsed.length} notes, ${chunksTotal} chunks, ${tokensTotal.toLocaleString()} tokens (~$${estCost.toFixed(3)})`);
  console.log('>> done');
  process.exit(0);
}

run().catch(err => {
  console.error('import-kb failed:', err);
  process.exit(1);
});
