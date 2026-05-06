import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import {
  listTemplates,
  createTemplate,
  DuplicateTemplateNameError,
  type BrainNoteTemplateTrigger,
} from '@/lib/brain/templates';

const VALID_TRIGGERS: BrainNoteTemplateTrigger[] = ['manual', 'daily', 'meeting', 'slash'];

function parseTrigger(raw: unknown): BrainNoteTemplateTrigger | undefined {
  return typeof raw === 'string' && (VALID_TRIGGERS as string[]).includes(raw)
    ? (raw as BrainNoteTemplateTrigger)
    : undefined;
}

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const triggerParam = url.searchParams.get('trigger');
  const enabledParam = url.searchParams.get('enabled');

  const trigger = triggerParam ? parseTrigger(triggerParam) : undefined;
  let enabled: boolean | undefined;
  if (enabledParam === 'true') enabled = true;
  else if (enabledParam === 'false') enabled = false;

  const items = await listTemplates(result.client.id, { trigger, enabled });
  return NextResponse.json({ success: true, data: { items } });
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 150) {
    return NextResponse.json({ success: false, message: 'name is required (1-150 characters)' }, { status: 400 });
  }
  if (typeof body.body !== 'string' || !body.body.length) {
    return NextResponse.json({ success: false, message: 'body is required' }, { status: 400 });
  }

  const trigger = parseTrigger(body.trigger) ?? 'manual';
  const variables = Array.isArray(body.variables)
    ? body.variables.filter((v: unknown): v is string => typeof v === 'string')
    : undefined;
  const defaultTags = Array.isArray(body.defaultTags)
    ? body.defaultTags.filter((t: unknown): t is string => typeof t === 'string')
    : undefined;
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;

  try {
    const created = await createTemplate({
      clientId: result.client.id,
      name,
      body: body.body,
      trigger,
      variables,
      defaultTags,
      enabled,
      createdBy: result.userId,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    if (err instanceof DuplicateTemplateNameError) {
      return NextResponse.json({ success: false, message: 'A template with that name already exists' }, { status: 409 });
    }
    console.error('[brain.templates] create failed', { clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
