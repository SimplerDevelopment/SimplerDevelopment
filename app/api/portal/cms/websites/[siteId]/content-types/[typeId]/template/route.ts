import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

interface BlockLike {
  id?: string;
  type?: string;
  order?: number;
  required?: boolean;
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
  [k: string]: unknown;
}

const POST_CONTENT_TYPE = 'post-content';

async function verifyTypeAccess(siteIdRaw: string, typeIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return null;
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteIdRaw)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return null;
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, parseInt(typeIdRaw)), eq(postTypes.websiteId, site.id)))
    .limit(1);
  return type ? { site, type } : null;
}

// Walk a block tree and return how many post-content placeholders it contains
// (recursing into columns/sections/tabs so a stray duplicate inside a column
// is still caught).
function countPostContent(blocks: BlockLike[] | undefined): number {
  if (!Array.isArray(blocks)) return 0;
  let n = 0;
  for (const b of blocks) {
    if (b?.type === POST_CONTENT_TYPE) n++;
    if (Array.isArray(b?.blocks)) n += countPostContent(b.blocks);
    if (Array.isArray(b?.columns)) for (const c of b.columns) n += countPostContent(c?.blocks);
  }
  return n;
}

// Walk and stamp every post-content block with required:true. Returns a fresh
// tree (never mutates).
function markPostContentRequired(blocks: BlockLike[]): BlockLike[] {
  return blocks.map(b => {
    let next = b;
    if (b?.type === POST_CONTENT_TYPE) next = { ...next, required: true };
    if (Array.isArray(b?.blocks)) next = { ...next, blocks: markPostContentRequired(b.blocks) };
    if (Array.isArray(b?.columns)) {
      next = { ...next, columns: b.columns.map(c => Array.isArray(c?.blocks) ? { ...c, blocks: markPostContentRequired(c.blocks) } : c) };
    }
    return next;
  });
}

// Singleton + required is a hard contract for templates. The default template
// (returned by GET when nothing is saved yet) IS this single block, so the
// editor never starts in an invalid state.
function makeDefaultPlaceholderBlock(): BlockLike {
  return { id: `block-post-content-${Date.now()}`, type: POST_CONTENT_TYPE, order: 0, required: true };
}

function makeDefaultTemplate() {
  return { blocks: [makeDefaultPlaceholderBlock()], version: '1.0' };
}

// GET → { template, defaulted }. `defaulted: true` when the type has no
// saved template yet — UI uses this to show "starter template" affordance
// vs "you have a saved template".
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  if (!ctx.type.template) {
    return NextResponse.json({
      success: true,
      data: { template: makeDefaultTemplate(), defaulted: true },
    });
  }
  let template: { blocks?: BlockLike[]; version?: string } | null = null;
  try { template = JSON.parse(ctx.type.template); } catch { template = null; }
  // Defensive: if a previously-saved template lost its placeholder somehow
  // (e.g. older save before the singleton rule landed), put one back so the
  // editor always opens in a valid state.
  if (template && Array.isArray(template.blocks) && countPostContent(template.blocks) === 0) {
    template = {
      blocks: [makeDefaultPlaceholderBlock(), ...template.blocks.map((b, i) => ({ ...b, order: (b.order ?? i) + 1 }))],
      version: template.version || '1.0',
    };
  }
  return NextResponse.json({ success: true, data: { template, defaulted: false } });
}

// PUT body: { template: { blocks, version } | null }.
// Templates require exactly one post-content placeholder. We auto-correct
// rather than reject — drop duplicates (keeping the first), prepend one if
// absent — so the editor's UX never loses work to validation. The UI also
// hides the placeholder from the picker once one exists.
export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { template } = body as { template?: { blocks?: BlockLike[]; version?: string } | null };

  // No body = explicit clear, but the contract says templates always have a
  // placeholder, so an "empty" template still has the singleton inside it.
  let inputBlocks: BlockLike[] = [];
  let version = '1.0';
  if (template && Array.isArray(template.blocks)) {
    inputBlocks = template.blocks;
    if (template.version) version = template.version;
  }

  // Drop all but the first post-content block.
  let seenPlaceholder = false;
  function dedupe(blocks: BlockLike[]): BlockLike[] {
    const out: BlockLike[] = [];
    for (const b of blocks) {
      if (b?.type === POST_CONTENT_TYPE) {
        if (seenPlaceholder) continue;
        seenPlaceholder = true;
        out.push({ ...b, required: true });
        continue;
      }
      let next = b;
      if (Array.isArray(b?.blocks)) next = { ...next, blocks: dedupe(b.blocks) };
      if (Array.isArray(b?.columns)) {
        next = { ...next, columns: b.columns.map(c => Array.isArray(c?.blocks) ? { ...c, blocks: dedupe(c.blocks) } : c) };
      }
      out.push(next);
    }
    return out;
  }
  let normalized = dedupe(inputBlocks);

  // Prepend a placeholder if there isn't one anywhere.
  if (!seenPlaceholder) {
    normalized = [makeDefaultPlaceholderBlock(), ...normalized.map((b, i) => ({ ...b, order: (b.order ?? i) + 1 }))];
  }

  // Belt-and-suspenders: ensure every surviving placeholder is marked required.
  normalized = markPostContentRequired(normalized);

  const serialized = JSON.stringify({ blocks: normalized, version });
  const [updated] = await db
    .update(postTypes)
    .set({ template: serialized, updatedAt: new Date() })
    .where(eq(postTypes.id, ctx.type.id))
    .returning();

  let parsed: unknown = null;
  if (updated.template) { try { parsed = JSON.parse(updated.template); } catch {} }
  return NextResponse.json({ success: true, data: { template: parsed, defaulted: false } });
}
