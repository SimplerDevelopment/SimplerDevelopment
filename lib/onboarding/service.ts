// Persistence layer for the onboarding wizard. The route handlers stay thin —
// they just authenticate, parse, and delegate here.

import { db } from '@/lib/db';
import { users, clients, userOnboarding, brandingProfiles, brandingMessaging, clientServices } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { OnboardingAnswers, OnboardingStep, OnboardingState } from './types';
import { ONBOARDING_STEPS } from './types';

function isStep(s: unknown): s is OnboardingStep {
  return typeof s === 'string' && (ONBOARDING_STEPS as string[]).includes(s);
}

/** Load (or lazily create) the onboarding row + prefill data for a user. */
export async function loadOnboarding(userId: number, clientId: number | null): Promise<OnboardingState> {
  const [existing] = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  // Fetch user first — validates existence before any insert to prevent FK violations
  // from stale JWT sessions referencing deleted/deactivated users (user_onboarding_user_id_users_id_fk).
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing && user) {
    await db.insert(userOnboarding).values({
      userId,
      clientId: clientId ?? null,
      step: 'welcome',
      answers: {},
    }).onConflictDoNothing();
  }

  const [row] = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  let company = '';
  let website = '';
  let showBillingSteps = false;
  if (clientId) {
    const [c] = await db
      .select({ company: clients.company, website: clients.website, billingMode: clients.billingMode })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    company = c?.company ?? '';
    website = c?.website ?? '';

    if (c?.billingMode === 'saas') {
      // Show billing steps only while the client has no active module subscription.
      const [activeService] = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')))
        .limit(1);
      showBillingSteps = !activeService;
    }
  }

  return {
    step: (row?.step as OnboardingStep) ?? 'welcome',
    answers: (row?.answers ?? {}) as OnboardingAnswers,
    completedAt: row?.completedAt ? row.completedAt.toISOString() : null,
    prefill: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      company,
      website,
    },
    showBillingSteps,
  };
}

/** Merge partial answers + optionally advance the step. Idempotent. */
export async function saveOnboardingStep(args: {
  userId: number;
  clientId: number | null;
  step?: OnboardingStep;
  patch?: Partial<OnboardingAnswers>;
}): Promise<OnboardingState> {
  const { userId, clientId, step, patch } = args;

  // Ensure row exists — guard against stale sessions for deleted users.
  const [userExists] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (userExists) {
    await db.insert(userOnboarding).values({
      userId,
      clientId: clientId ?? null,
      step: 'welcome',
      answers: {},
    }).onConflictDoNothing();
  }

  const [current] = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  const nextAnswers: OnboardingAnswers = { ...(current?.answers as OnboardingAnswers ?? {}), ...(patch ?? {}) };
  const nextStep: OnboardingStep = step && isStep(step) ? step : ((current?.step as OnboardingStep) ?? 'welcome');

  await db.update(userOnboarding)
    .set({ answers: nextAnswers, step: nextStep, updatedAt: new Date() })
    .where(eq(userOnboarding.userId, userId));

  // Mirror brand-relevant answers into branding_profiles / branding_messaging
  // so the default brand reflects what the user told us right away. Side-effect
  // is opportunistic: never blocks the wizard.
  if (clientId && patch) {
    void mirrorBrandAnswers(clientId, patch).catch(() => {});
  }
  if (clientId && patch?.industry !== undefined) {
    void mirrorClientIndustry(clientId, patch.industry ?? null).catch(() => {});
  }

  return loadOnboarding(userId, clientId);
}

/** Mark onboarding complete and stamp completedAt. */
export async function completeOnboarding(userId: number, clientId: number | null): Promise<OnboardingState> {
  await db.insert(userOnboarding).values({
    userId,
    clientId: clientId ?? null,
    step: 'done',
    answers: {},
    completedAt: new Date(),
  }).onConflictDoNothing();

  await db.update(userOnboarding)
    .set({ step: 'done', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(userOnboarding.userId, userId));

  return loadOnboarding(userId, clientId);
}

/** Reopen the wizard for a user (clears completedAt; preserves answers). */
export async function reopenOnboarding(userId: number, clientId: number | null): Promise<OnboardingState> {
  await db.update(userOnboarding)
    .set({ completedAt: null, step: 'welcome', updatedAt: new Date() })
    .where(eq(userOnboarding.userId, userId));
  return loadOnboarding(userId, clientId);
}

async function mirrorBrandAnswers(clientId: number, patch: Partial<OnboardingAnswers>): Promise<void> {
  const brandColor = patch.primaryColor;
  const brandTones = patch.brandTones;
  const mission = patch.mission;

  if (brandColor) {
    // Update the default brand profile's primary color (and create one if
    // none exists). Other colors are left alone — the user can refine in
    // /portal/branding later.
    const [existing] = await db
      .select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
      .limit(1);
    if (existing) {
      await db.update(brandingProfiles)
        .set({ primaryColor: brandColor, updatedAt: new Date() })
        .where(eq(brandingProfiles.id, existing.id));
    } else {
      await db.insert(brandingProfiles).values({
        clientId,
        name: 'Default',
        isDefault: true,
        primaryColor: brandColor,
      });
    }
  }

  if (brandTones?.length || mission) {
    const tones = brandTones?.length
      ? brandTones.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
      : undefined;
    const [profile] = await db
      .select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
      .limit(1);
    if (profile) {
      const [msg] = await db
        .select({ id: brandingMessaging.id })
        .from(brandingMessaging)
        .where(eq(brandingMessaging.brandingProfileId, profile.id))
        .limit(1);
      if (msg) {
        await db.update(brandingMessaging)
          .set({
            ...(tones ? { toneOfVoice: tones } : {}),
            ...(mission ? { missionStatement: mission } : {}),
            updatedAt: new Date(),
          })
          .where(eq(brandingMessaging.id, msg.id));
      } else {
        await db.insert(brandingMessaging).values({
          clientId,
          brandingProfileId: profile.id,
          toneOfVoice: tones ?? null,
          missionStatement: mission ?? null,
        });
      }
    }
  }
}

async function mirrorClientIndustry(clientId: number, industry: string | null): Promise<void> {
  const [profile] = await db
    .select({ id: brandingProfiles.id })
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
    .limit(1);
  if (!profile) return;
  const [msg] = await db
    .select({ id: brandingMessaging.id })
    .from(brandingMessaging)
    .where(eq(brandingMessaging.brandingProfileId, profile.id))
    .limit(1);
  if (msg) {
    await db.update(brandingMessaging)
      .set({ industry, updatedAt: new Date() })
      .where(eq(brandingMessaging.id, msg.id));
  } else {
    await db.insert(brandingMessaging).values({ clientId, brandingProfileId: profile.id, industry });
  }
}
