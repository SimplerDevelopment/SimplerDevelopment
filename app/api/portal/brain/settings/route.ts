import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import {
  getOrCreateBrainProfile,
  applyIndustryTemplateDefaults,
  updateBrainProfile,
} from '@/lib/brain/profiles';
import { listIndustryTemplates, getIndustryTemplate, type IndustryTemplateId } from '@/lib/brain/industry-templates';

const VALID_TEMPLATES = new Set(listIndustryTemplates().map(t => t.id));
const VALID_CONFIDENTIALITY = new Set(['standard', 'restricted', 'confidential'] as const);

export async function GET() {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { client } = result;
  const profile = await getOrCreateBrainProfile(client.id, client.company || 'Company Brain');
  const template = getIndustryTemplate(profile.industryTemplate);

  return NextResponse.json({
    success: true,
    data: {
      profile,
      template,
      availableTemplates: listIndustryTemplates(),
    },
  });
}

export async function PUT(request: Request) {
  const result = await authorizePortal({ action: 'admin' });
  if (isAuthError(result)) return result.response;

  const { client } = result;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }

  await getOrCreateBrainProfile(client.id, client.company || 'Company Brain');

  const updates: Parameters<typeof updateBrainProfile>[1] = {};
  let templateChange: IndustryTemplateId | null = null;

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 255);
  }
  if (typeof body.industryTemplate === 'string') {
    if (!VALID_TEMPLATES.has(body.industryTemplate as IndustryTemplateId)) {
      return NextResponse.json({ success: false, message: 'Unknown industry template' }, { status: 400 });
    }
    templateChange = body.industryTemplate as IndustryTemplateId;
  }
  if (typeof body.enabled === 'boolean') {
    updates.enabled = body.enabled;
  }
  if (typeof body.defaultConfidentiality === 'string') {
    if (!VALID_CONFIDENTIALITY.has(body.defaultConfidentiality as 'standard' | 'restricted' | 'confidential')) {
      return NextResponse.json({ success: false, message: 'Unknown confidentiality level' }, { status: 400 });
    }
    updates.defaultConfidentiality = body.defaultConfidentiality as 'standard' | 'restricted' | 'confidential';
  }
  if (body.enabledModules && typeof body.enabledModules === 'object') {
    updates.enabledModules = body.enabledModules;
  }
  if (Array.isArray(body.serviceLines)) {
    updates.serviceLines = body.serviceLines.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100);
  }

  let profile = await updateBrainProfile(client.id, updates);
  if (templateChange) {
    profile = await applyIndustryTemplateDefaults(client.id, templateChange);
  }

  return NextResponse.json({
    success: true,
    data: {
      profile,
      template: profile ? getIndustryTemplate(profile.industryTemplate) : null,
    },
  });
}
