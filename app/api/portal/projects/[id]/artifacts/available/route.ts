import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  projects,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
  posts,
  brainNotes,
} from '@/lib/db/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// Per-type fetch configs. Each returns rows shaped { id, title } scoped to
// clientId, optionally filtered by a case-insensitive `q` search and capped
// at `limit`. Posts and brain_notes have extra gating so they're handled
// inline below.
const SIMPLE_TYPES = {
  website: { table: clientWebsites, titleField: 'name' as const },
  email_campaign: { table: emailCampaigns, titleField: 'name' as const },
  pitch_deck: { table: pitchDecks, titleField: 'title' as const },
  proposal: { table: crmProposals, titleField: 'title' as const },
  booking: { table: bookingPages, titleField: 'title' as const },
  survey: { table: surveys, titleField: 'title' as const },
};

const SUPPORTED_TYPES = [
  ...Object.keys(SIMPLE_TYPES),
  'brain_note',
  'post',
  'all',
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT_PER_TYPE = 200;
const MAX_LIMIT_ALL_PER_TYPE = 10;

function parseLimit(raw: string | null, max: number, dflt: number): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n <= 0) return dflt;
  return Math.min(n, max);
}

async function fetchSimple(
  type: keyof typeof SIMPLE_TYPES,
  clientId: number,
  limit: number,
  q: string | null,
): Promise<{ type: string; id: number; title: string }[]> {
  const cfg = SIMPLE_TYPES[type];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table: any = cfg.table;
  const titleCol = table[cfg.titleField];
  const where = q
    ? and(eq(table.clientId, clientId), sql`${titleCol} ILIKE ${'%' + q + '%'}`)
    : eq(table.clientId, clientId);
  const rows = await db
    .select({ id: table.id, title: titleCol })
    .from(table)
    .where(where)
    .limit(limit);
  return rows.map((r: { id: number; title: string | null }) => ({
    type,
    id: r.id,
    title: r.title ?? 'Untitled',
  }));
}

async function fetchBrainNotes(
  clientId: number,
  limit: number,
  q: string | null,
): Promise<{ type: string; id: number; title: string }[]> {
  const baseWhere = and(eq(brainNotes.clientId, clientId), isNull(brainNotes.deletedAt));
  const where = q
    ? and(baseWhere, sql`${brainNotes.title} ILIKE ${'%' + q + '%'}`)
    : baseWhere;
  const rows = await db
    .select({ id: brainNotes.id, title: brainNotes.title })
    .from(brainNotes)
    .where(where)
    .limit(limit);
  return rows.map(r => ({ type: 'brain_note', id: r.id, title: r.title ?? 'Untitled' }));
}

async function fetchPosts(
  clientId: number,
  limit: number,
  q: string | null,
): Promise<{ type: string; id: number; title: string }[]> {
  const sites = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, clientId));
  if (sites.length === 0) return [];
  const siteIds = sites.map(s => s.id);
  const where = q
    ? and(inArray(posts.websiteId, siteIds), sql`${posts.title} ILIKE ${'%' + q + '%'}`)
    : inArray(posts.websiteId, siteIds);
  const postRows = await db
    .select({ id: posts.id, title: posts.title, postType: posts.postType })
    .from(posts)
    .where(where)
    .limit(limit);
  return postRows.map(r => ({
    type: 'post',
    id: r.id,
    title: `${r.title}${r.postType && r.postType !== 'blog' ? ` (${r.postType})` : ''}`,
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const typeFilter = req.nextUrl.searchParams.get('type');
  if (!typeFilter) {
    return NextResponse.json(
      {
        success: false,
        message:
          'type query parameter is required. Pass one of: ' +
          SUPPORTED_TYPES.join(', ') +
          '. Use ?type=all for a small browse-all sample.',
      },
      { status: 400 },
    );
  }
  if (!(SUPPORTED_TYPES as readonly string[]).includes(typeFilter)) {
    return NextResponse.json(
      { success: false, message: `Unknown type "${typeFilter}". Supported: ${SUPPORTED_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);

  // Parallelize project lookup against any client-fetch we might need.
  const [projectRow] = await db.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!projectRow) return NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 });

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== projectRow.clientId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
  }

  const clientId = projectRow.clientId;
  const q = req.nextUrl.searchParams.get('q')?.trim() || null;

  // type=all → small per-type browse sample (max 10 per type by default,
  // capped at MAX_LIMIT_ALL_PER_TYPE) so callers still get a varied picker
  // without exploding into 8 unbounded scans.
  if (typeFilter === 'all') {
    const perType = parseLimit(
      req.nextUrl.searchParams.get('limit'),
      MAX_LIMIT_ALL_PER_TYPE,
      MAX_LIMIT_ALL_PER_TYPE,
    );
    const simpleKeys = Object.keys(SIMPLE_TYPES) as (keyof typeof SIMPLE_TYPES)[];
    const batches = await Promise.all([
      ...simpleKeys.map(k => fetchSimple(k, clientId, perType, q)),
      fetchBrainNotes(clientId, perType, q),
      fetchPosts(clientId, perType, q),
    ]);
    return NextResponse.json({ success: true, data: batches.flat() });
  }

  const limit = parseLimit(
    req.nextUrl.searchParams.get('limit'),
    MAX_LIMIT_PER_TYPE,
    DEFAULT_LIMIT,
  );

  let results: { type: string; id: number; title: string }[];
  if (typeFilter === 'brain_note') {
    results = await fetchBrainNotes(clientId, limit, q);
  } else if (typeFilter === 'post') {
    results = await fetchPosts(clientId, limit, q);
  } else {
    results = await fetchSimple(typeFilter as keyof typeof SIMPLE_TYPES, clientId, limit, q);
  }

  return NextResponse.json({ success: true, data: results });
}
