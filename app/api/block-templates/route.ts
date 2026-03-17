import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { blockTemplates } from '@/lib/db/schema';
import { eq, desc, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const scope = searchParams.get('scope');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = db.select().from(blockTemplates);

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createTemplateSchema.parse(body);

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
      })
      .returning();

    return NextResponse.json(
      { success: true, data: template },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.errors },
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
