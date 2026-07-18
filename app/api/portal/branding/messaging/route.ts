import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingMessaging } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('profileId');

  const condition = profileId
    ? and(eq(brandingMessaging.clientId, client.id), eq(brandingMessaging.brandingProfileId, parseInt(profileId, 10)))
    : and(eq(brandingMessaging.clientId, client.id), isNull(brandingMessaging.brandingProfileId));

  const [messaging] = await db
    .select()
    .from(brandingMessaging)
    .where(condition)
    .limit(1);

  return NextResponse.json({ success: true, data: messaging ?? null });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const profileId = body.brandingProfileId ?? null;

  const values = {
    clientId: client.id,
    brandingProfileId: profileId,
    companyName: body.companyName ?? null,
    tagline: body.tagline ?? null,
    missionStatement: body.missionStatement ?? null,
    visionStatement: body.visionStatement ?? null,
    valueProposition: body.valueProposition ?? null,
    toneOfVoice: body.toneOfVoice ?? null,
    brandPersonality: body.brandPersonality ?? null,
    writingStyle: body.writingStyle ?? null,
    elevatorPitch: body.elevatorPitch ?? null,
    boilerplate: body.boilerplate ?? null,
    keyDifferentiators: body.keyDifferentiators ?? null,
    targetAudience: body.targetAudience ?? null,
    industry: body.industry ?? null,
    yearFounded: body.yearFounded ?? null,
    companySize: body.companySize ?? null,
    headquarters: body.headquarters ?? null,
    websiteUrl: body.websiteUrl ?? null,
    socialProof: body.socialProof ?? null,
    keyClients: body.keyClients ?? null,
    certifications: body.certifications ?? null,
    additionalContext: body.additionalContext ?? null,
    toneAxes: body.toneAxes ?? null,
    voiceSamples: body.voiceSamples ?? null,
    updatedAt: new Date(),
  };

  // Check if record exists for this client+profile combo
  const condition = profileId
    ? and(eq(brandingMessaging.clientId, client.id), eq(brandingMessaging.brandingProfileId, profileId))
    : and(eq(brandingMessaging.clientId, client.id), isNull(brandingMessaging.brandingProfileId));

  const [existing] = await db
    .select({ id: brandingMessaging.id })
    .from(brandingMessaging)
    .where(condition)
    .limit(1);

  let messaging;
  if (existing) {
    [messaging] = await db
      .update(brandingMessaging)
      .set(values)
      .where(eq(brandingMessaging.id, existing.id))
      .returning();
  } else {
    [messaging] = await db
      .insert(brandingMessaging)
      .values(values)
      .returning();
  }

  return NextResponse.json({ success: true, data: messaging });
}
