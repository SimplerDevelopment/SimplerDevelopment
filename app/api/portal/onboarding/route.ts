import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { completeOnboarding, loadOnboarding, reopenOnboarding, saveOnboardingStep } from '@/lib/onboarding/service';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding/types';

export const dynamic = 'force-dynamic';

async function resolveSessionAndClient() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  return { userId, clientId: client?.id ?? null };
}

export async function GET() {
  const ctx = await resolveSessionAndClient();
  if ('error' in ctx) return ctx.error;
  const state = await loadOnboarding(ctx.userId, ctx.clientId);
  return NextResponse.json({ success: true, data: state });
}

export async function PATCH(req: Request) {
  const ctx = await resolveSessionAndClient();
  if ('error' in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const { step, answers } = body as { step?: string; answers?: Record<string, unknown> };

  if (step && !(ONBOARDING_STEPS as string[]).includes(step)) {
    return NextResponse.json({ success: false, message: 'Invalid step' }, { status: 400 });
  }

  // Light field-shape sanitization. We trust the dropdowns/checkbox UI to
  // produce well-formed values, but defend against length blowups.
  const patch: Record<string, unknown> = {};
  if (answers) {
    if (typeof answers.role === 'string') patch.role = answers.role.slice(0, 100);
    if (typeof answers.timezone === 'string') patch.timezone = answers.timezone.slice(0, 100);
    if (typeof answers.companySize === 'string') patch.companySize = answers.companySize.slice(0, 50);
    if (typeof answers.industry === 'string') patch.industry = answers.industry.slice(0, 100);
    if (typeof answers.websiteUrl === 'string') patch.websiteUrl = answers.websiteUrl.slice(0, 500);
    if (Array.isArray(answers.brandTones)) patch.brandTones = answers.brandTones.filter((t): t is string => typeof t === 'string').slice(0, 8);
    if (typeof answers.primaryColor === 'string') patch.primaryColor = answers.primaryColor.slice(0, 20);
    if (typeof answers.mission === 'string') patch.mission = answers.mission.slice(0, 1000);
    if (Array.isArray(answers.featuresInterested)) patch.featuresInterested = answers.featuresInterested.filter((t): t is string => typeof t === 'string').slice(0, 30);
    if (typeof answers.skillsDownloaded === 'boolean') patch.skillsDownloaded = answers.skillsDownloaded;
    if (typeof answers.mcpKeyCreatedId === 'number') patch.mcpKeyCreatedId = answers.mcpKeyCreatedId;
    if (Array.isArray(answers.selectedModules)) patch.selectedModules = answers.selectedModules.filter((t): t is string => typeof t === 'string').slice(0, 20);
    if (typeof answers.checkoutCompletedAt === 'string') patch.checkoutCompletedAt = answers.checkoutCompletedAt.slice(0, 50);
    if (answers.moduleSetup && typeof answers.moduleSetup === 'object' && !Array.isArray(answers.moduleSetup)) {
      const safe: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(answers.moduleSetup as Record<string, unknown>)) {
        if (typeof k === 'string' && Array.isArray(v)) {
          safe[k.slice(0, 50)] = v.filter((x): x is string => typeof x === 'string').slice(0, 30);
        }
      }
      patch.moduleSetup = safe;
    }
    if (typeof answers.checklistDismissedAt === 'string') patch.checklistDismissedAt = answers.checklistDismissedAt.slice(0, 50);
  }

  const state = await saveOnboardingStep({
    userId: ctx.userId,
    clientId: ctx.clientId,
    step: step as OnboardingStep | undefined,
    patch,
  });
  return NextResponse.json({ success: true, data: state });
}

export async function POST(req: Request) {
  // POST is used for terminal actions: complete + reopen.
  const ctx = await resolveSessionAndClient();
  if ('error' in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: 'complete' | 'reopen' };

  if (action === 'complete') {
    const state = await completeOnboarding(ctx.userId, ctx.clientId);
    return NextResponse.json({ success: true, data: state });
  }
  if (action === 'reopen') {
    const state = await reopenOnboarding(ctx.userId, ctx.clientId);
    return NextResponse.json({ success: true, data: state });
  }
  return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
}
