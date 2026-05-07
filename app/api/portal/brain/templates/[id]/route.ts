import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  DuplicateTemplateNameError,
  type BrainNoteTemplateTrigger,
} from '@/lib/brain/templates';

const VALID_TRIGGERS: BrainNoteTemplateTrigger[] = ['manual', 'daily', 'meeting', 'slash'];

function parseTrigger(raw: unknown): BrainNoteTemplateTrigger | undefined {
  return typeof raw === 'string' && (VALID_TRIGGERS as string[]).includes(raw)
    ? (raw as BrainNoteTemplateTrigger)
    : undefined;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (Number.isNaN(templateId)) {
    return NextResponse.json({ success: false, message: 'Invalid template id' }, { status: 400 });
  }
  const template = await getTemplate(result.client.id, templateId);
  if (!template) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: template });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (Number.isNaN(templateId)) {
    return NextResponse.json({ success: false, message: 'Invalid template id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const patch: Parameters<typeof updateTemplate>[2] = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 150) {
      return NextResponse.json({ success: false, message: 'name must be 1-150 characters' }, { status: 400 });
    }
    patch.name = body.name;
  }
  if (body.body !== undefined) {
    if (typeof body.body !== 'string' || !body.body.length) {
      return NextResponse.json({ success: false, message: 'body must be a non-empty string' }, { status: 400 });
    }
    patch.body = body.body;
  }
  if (body.trigger !== undefined) {
    const trigger = parseTrigger(body.trigger);
    if (!trigger) {
      return NextResponse.json({ success: false, message: 'invalid trigger' }, { status: 400 });
    }
    patch.trigger = trigger;
  }
  if (body.variables !== undefined) {
    patch.variables = Array.isArray(body.variables)
      ? body.variables.filter((v: unknown): v is string => typeof v === 'string')
      : null;
  }
  if (body.defaultTags !== undefined) {
    patch.defaultTags = Array.isArray(body.defaultTags)
      ? body.defaultTags.filter((t: unknown): t is string => typeof t === 'string')
      : null;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ success: false, message: 'enabled must be a boolean' }, { status: 400 });
    }
    patch.enabled = body.enabled;
  }

  try {
    const updated = await updateTemplate(result.client.id, templateId, patch, result.userId);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof DuplicateTemplateNameError) {
      return NextResponse.json({ success: false, message: 'A template with that name already exists' }, { status: 409 });
    }
    console.error('[brain.templates] update failed', { templateId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (Number.isNaN(templateId)) {
    return NextResponse.json({ success: false, message: 'Invalid template id' }, { status: 400 });
  }

  try {
    const ok = await deleteTemplate(result.client.id, templateId, result.userId);
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[brain.templates] delete failed', { templateId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
