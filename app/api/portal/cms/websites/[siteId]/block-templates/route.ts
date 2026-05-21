import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { blockTemplates, type BlockTemplateDraft } from '@/lib/db/schema';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { resolveClientSite } from '@/lib/portal-client';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  description: z.string().optional(),
  category: z.string().default('custom'),
  scope: z.enum(['block', 'section', 'global']).default('block'),
  blocks: z.array(z.any()).min(1, 'At least one block is required'),
  thumbnail: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
  lockedFields: z.array(z.string()).optional(),
});

async function gate(siteIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    };
  }
  const userId = parseInt(session.user.id, 10);
  const siteId = parseInt(siteIdRaw, 10);
  if (!Number.isFinite(siteId)) {
    return {
      response: NextResponse.json({ success: false, message: 'Invalid site id' }, { status: 400 }),
    };
  }
  const site = await resolveClientSite(userId, siteId);
  if (!site) {
    return {
      response: NextResponse.json({ success: false, message: 'Not found' }, { status: 404 }),
    };
  }
  return { userId, clientId: site.clientId };
}

/**
 * Lists templates this tenant can use: rows scoped to its client_id, plus
 * platform-global rows (client_id IS NULL).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const gateResult = await gate(siteId);
  if ('response' in gateResult) return gateResult.response;
  const { clientId } = gateResult;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const scope = searchParams.get('scope');
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const tenantScope = or(eq(blockTemplates.clientId, clientId), isNull(blockTemplates.clientId))!;
  const conditions = [tenantScope];

  if (category) conditions.push(eq(blockTemplates.category, category));
  if (scope) conditions.push(eq(blockTemplates.scope, scope));
  if (search) {
    conditions.push(
      or(
        ilike(blockTemplates.name, `%${search}%`),
        ilike(blockTemplates.description, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(blockTemplates)
    .where(and(...conditions))
    .orderBy(desc(blockTemplates.updatedAt))
    .limit(limit)
    .offset(offset);

  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(blockTemplates)
    .where(tenantScope);

  return NextResponse.json({
    success: true,
    data: rows,
    pagination: { total: Number(count?.count || 0), limit, offset },
  });
}

/**
 * Saves a template scoped to this tenant's client. Mirrors the admin
 * /api/block-templates POST (writes everything into draft.pendingCreate so the
 * picker hides it until …/publish), but stamps clientId from the resolved site.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const gateResult = await gate(siteId);
  if ('response' in gateResult) return gateResult.response;
  const { userId, clientId } = gateResult;

  try {
    const body = await request.json();
    const parsed = createTemplateSchema.parse(body);

    const existing = await db
      .select({ id: blockTemplates.id })
      .from(blockTemplates)
      .where(eq(blockTemplates.slug, parsed.slug));
    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, message: 'A template with this slug already exists' },
        { status: 409 },
      );
    }

    const draft = {
      pendingCreate: true,
      name: parsed.name,
      description: parsed.description ?? null,
      category: parsed.category,
      scope: parsed.scope,
      blocks: parsed.blocks,
      thumbnail: parsed.thumbnail || null,
      tags: parsed.tags ?? [],
      lockedFields: parsed.lockedFields ?? [],
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    } as BlockTemplateDraft & { pendingCreate: boolean };

    const [template] = await db
      .insert(blockTemplates)
      .values({
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description || null,
        category: parsed.category,
        scope: parsed.scope,
        blocks: parsed.blocks,
        thumbnail: parsed.thumbnail || null,
        tags: parsed.tags || [],
        lockedFields: parsed.lockedFields || [],
        clientId,
        createdBy: userId,
        draft,
      })
      .returning();

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.issues },
        { status: 400 },
      );
    }
    console.error('Error creating block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create block template' },
      { status: 500 },
    );
  }
}
