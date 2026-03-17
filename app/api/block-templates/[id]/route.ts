import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { blockTemplates, blockTemplateUsages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  scope: z.enum(['block', 'section', 'global']).optional(),
  blocks: z.array(z.any()).min(1).optional(),
  thumbnail: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
  lockedFields: z.array(z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const [template] = await db
      .select()
      .from(blockTemplates)
      .where(eq(blockTemplates.id, templateId));

    if (!template) {
      return NextResponse.json(
        { success: false, message: 'Template not found' },
        { status: 404 }
      );
    }

    // If global, also fetch usage count
    let usageCount = 0;
    if (template.scope === 'global') {
      const usages = await db
        .select()
        .from(blockTemplateUsages)
        .where(eq(blockTemplateUsages.templateId, templateId));
      usageCount = usages.length;
    }

    return NextResponse.json({
      success: true,
      data: { ...template, usageCount },
    });
  } catch (error) {
    console.error('Error fetching block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch block template' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.parse(body);

    // Check template exists
    const [existing] = await db
      .select()
      .from(blockTemplates)
      .where(eq(blockTemplates.id, templateId));

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Template not found' },
        { status: 404 }
      );
    }

    // If blocks changed, bump version
    const shouldBumpVersion = parsed.blocks !== undefined;

    const [updated] = await db
      .update(blockTemplates)
      .set({
        ...parsed,
        ...(shouldBumpVersion ? { version: existing.version + 1 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(blockTemplates.id, templateId))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update block template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid template ID' },
        { status: 400 }
      );
    }

    // Check for global usages before deleting
    const usages = await db
      .select()
      .from(blockTemplateUsages)
      .where(eq(blockTemplateUsages.templateId, templateId));

    if (usages.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.`,
        },
        { status: 409 }
      );
    }

    await db.delete(blockTemplates).where(eq(blockTemplates.id, templateId));

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete block template' },
      { status: 500 }
    );
  }
}
