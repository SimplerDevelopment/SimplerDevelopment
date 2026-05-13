import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { blockTemplates, type BlockTemplateDraft } from '@/lib/db/schema';
import { eq, desc, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertBlocksAllowedForRole, BlockGateError } from '@/lib/security/block-allowlist';

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

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauth' as const };
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'editor') return { error: 'forbidden' as const, role };
  return { session, role, userId: parseInt(session.user.id, 10) };
}

function gateResponse(result: Awaited<ReturnType<typeof requireAdminOrEditor>>) {
  if ('error' in result) {
    if (result.error === 'unauth') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const scope = searchParams.get('scope');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions = [];

    if (category) {
      conditions.push(eq(blockTemplates.category, category));
    }

    if (scope) {
      conditions.push(eq(blockTemplates.scope, scope));
    }

    if (search) {
      conditions.push(
        or(
          ilike(blockTemplates.name, `%${search}%`),
          ilike(blockTemplates.description, `%${search}%`),
        )!
      );
    }

    // GET returns the full row including `draft` so the admin can render
    // draft / pendingDelete badges. The picker that inserts a template into
    // a post (components/blocks/TemplateLibrary.tsx) reads `template.blocks`
    // which is the live column — confirmed safe.
    const result = conditions.length > 0
      ? await db
          .select()
          .from(blockTemplates)
          .where(conditions.length === 1 ? conditions[0] : sql`${conditions.map((c, i) => i === 0 ? c : sql` AND ${c}`)}`)
          .orderBy(desc(blockTemplates.updatedAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(blockTemplates)
          .orderBy(desc(blockTemplates.updatedAt))
          .limit(limit)
          .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(blockTemplates);

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching block templates:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch block templates' },
      { status: 500 }
    );
  }
}

/**
 * Creates a block template as a draft. The row is persisted with neutral
 * live columns (required NOT NULL) and ALL the meaningful fields go into
 * `draft = { pendingCreate: true, …fields }`. The picker hides
 * pendingCreate-only templates until `…/publish` is called.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
  if ('error' in gate) throw new Error('unreachable'); // gate is now narrowed
  try {
    const body = await request.json();
    const parsed = createTemplateSchema.parse(body);

    try {
      assertBlocksAllowedForRole(parsed.blocks, gate.role);
    } catch (e) {
      if (e instanceof BlockGateError) {
        return NextResponse.json({ success: false, message: e.message }, { status: 403 });
      }
      throw e;
    }

    // Check for slug uniqueness
    const existing = await db
      .select()
      .from(blockTemplates)
      .where(eq(blockTemplates.slug, parsed.slug));

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, message: 'A template with this slug already exists' },
        { status: 409 }
      );
    }

    // `pendingCreate` is not declared on the BlockTemplateDraft interface
    // (parity bug in lib/db/schema/cms.ts vs SiteNavigationDraft), but the
    // approvals.ts apply case for `block_template:create` writes it the same
    // way via a cast. Cast preserves the on-disk shape it expects.
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
      updatedBy: gate.userId,
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
        createdBy: gate.userId,
        draft,
      })
      .returning();

    return NextResponse.json(
      { success: true, data: template },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create block template' },
      { status: 500 }
    );
  }
}
