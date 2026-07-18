import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  blockTemplates,
  blockTemplateUsages,
  type BlockTemplateDraft,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertBlocksAllowedForRole, BlockGateError } from '@/lib/security/block-allowlist';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
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

/**
 * Stages changes to a template into its `draft` jsonb overlay. Live columns
 * and `version` are untouched until `…/[id]/publish` is called.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
  if ('error' in gate) throw new Error('unreachable'); // gate is now narrowed
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

    if (parsed.blocks !== undefined) {
      try {
        assertBlocksAllowedForRole(parsed.blocks, gate.role);
      } catch (e) {
        if (e instanceof BlockGateError) {
          return NextResponse.json({ success: false, message: e.message }, { status: 403 });
        }
        throw e;
      }
    }

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

    const prev: BlockTemplateDraft = existing.draft ?? {};
    const next: BlockTemplateDraft = {
      ...prev,
      updatedAt: new Date().toISOString(),
      updatedBy: gate.userId,
    };
    for (const [k, v] of Object.entries(parsed)) {
      if (v === undefined) continue;
      (next as Record<string, unknown>)[k] = v;
    }

    const [updated] = await db
      .update(blockTemplates)
      .set({ draft: next, updatedAt: new Date() })
      .where(eq(blockTemplates.id, templateId))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.issues },
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

/**
 * Stages a tombstone on the template (`draft.pendingDelete = true`). The row
 * is NOT physically deleted until `…/[id]/publish` runs; until then the
 * picker and global-sync paths keep resolving the live copy.
 *
 * Refuses if the template has any global usages — convert/remove those first.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
  if ('error' in gate) throw new Error('unreachable'); // gate is now narrowed
  try {
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid template ID' },
        { status: 400 }
      );
    }

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

    // Check for global usages before staging a delete
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

    const prev: BlockTemplateDraft = existing.draft ?? {};
    // If this is a draft-only row (pendingCreate, never published) the delete
    // semantics make more sense as a hard drop — nothing live to tombstone.
    // `pendingCreate` is not declared on BlockTemplateDraft (only on the disk
    // shape via the create path) — read it with a defensive cast.
    if ((prev as { pendingCreate?: boolean }).pendingCreate) {
      await db.delete(blockTemplates).where(eq(blockTemplates.id, templateId));
      return NextResponse.json({ success: true, message: 'Draft template discarded' });
    }

    const next: BlockTemplateDraft = {
      ...prev,
      pendingDelete: true,
      updatedAt: new Date().toISOString(),
      updatedBy: gate.userId,
    };
    await db
      .update(blockTemplates)
      .set({ draft: next, updatedAt: new Date() })
      .where(eq(blockTemplates.id, templateId));

    return NextResponse.json({ success: true, message: 'Template deletion staged' });
  } catch (error) {
    console.error('Error deleting block template:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete block template' },
      { status: 500 }
    );
  }
}
