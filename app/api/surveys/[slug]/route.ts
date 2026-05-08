import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyResponses, surveyVariants } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { headers } from 'next/headers';
import { getBrandingBySurveySlug, brandingToCssVars } from '@/lib/branding';
import { dispatchSurveyResponseWebhooks } from '@/lib/survey-webhooks/dispatcher';
import { ensureVisitorId } from '@/lib/ab/visitor';
import { assignSurveyVariant } from '@/lib/surveys/variant-assign';

// CORS — public survey submit needs to accept POST from sandboxed iframes
// (their effective origin is `null`, so `*` matches). The endpoint is
// already public (no auth, no credentials), so opening it cross-origin
// doesn't expand the trust surface.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Wraps NextResponse.json with CORS headers — the actual POST/GET responses
// need to echo `Access-Control-Allow-Origin` for browsers to let the iframe
// read them. Wrapping at every call site is noisy, so we shadow the helper.
function corsJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

// Public GET — fetch survey for rendering
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      fields: surveys.fields,
      color: surveys.color,
      status: surveys.status,
      requireEmail: surveys.requireEmail,
      closesAt: surveys.closesAt,
      maxResponses: surveys.maxResponses,
      responseCount: surveys.responseCount,
      thankYouTitle: surveys.thankYouTitle,
      thankYouMessage: surveys.thankYouMessage,
      redirectUrl: surveys.redirectUrl,
      styling: surveys.styling,
      recommendation: surveys.recommendation,
    })
    .from(surveys)
    .where(eq(surveys.slug, slug));

  if (!survey) return corsJson({ success: false, message: 'Survey not found' }, { status: 404 });
  if (survey.status !== 'active') return corsJson({ success: false, message: 'Survey is not active' }, { status: 403 });
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) return corsJson({ success: false, message: 'Survey is closed' }, { status: 403 });
  if (survey.maxResponses && survey.responseCount >= survey.maxResponses) return corsJson({ success: false, message: 'Survey has reached maximum responses' }, { status: 403 });

  const branding = await getBrandingBySurveySlug(slug);
  const cssVars = branding ? brandingToCssVars(branding) : undefined;

  // Fork field set by enabled variant when present. The picker is deterministic
  // on `surveyId:visitorId`, so a returning visitor always sees the same form.
  // Falls back to `surveys.fields` when no variants exist or none are enabled.
  const variants = await db
    .select({
      id: surveyVariants.id,
      name: surveyVariants.name,
      fields: surveyVariants.fields,
      weight: surveyVariants.weight,
      enabled: surveyVariants.enabled,
    })
    .from(surveyVariants)
    .where(eq(surveyVariants.surveyId, survey.id));

  let pickedFields = survey.fields;
  let variantId: number | null = null;
  let variantName: string | null = null;
  if (variants.some((v) => v.enabled && v.weight > 0)) {
    const visitor = await ensureVisitorId();
    const picked = assignSurveyVariant(survey.id, visitor.id, variants);
    if (picked) {
      pickedFields = picked.fields;
      variantId = picked.id;
      variantName = picked.name;
    }
  }

  return corsJson({
    success: true,
    data: {
      ...survey,
      fields: pickedFields,
      variantId,
      variantName,
      branding: branding ? {
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor,
        backgroundColor: branding.backgroundColor,
        textColor: branding.textColor,
        headingFont: branding.headingFont,
        bodyFont: branding.bodyFont,
        logoUrl: branding.logoUrl || branding.logoRectUrl,
        borderRadius: branding.borderRadius,
        buttonStyle: branding.buttonStyle,
      } : null,
      cssVars,
    },
  });
}

// Public POST — submit a response
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug));
  if (!survey) return corsJson({ success: false, message: 'Survey not found' }, { status: 404 });
  if (survey.status !== 'active') return corsJson({ success: false, message: 'Survey is not active' }, { status: 403 });
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) return corsJson({ success: false, message: 'Survey is closed' }, { status: 403 });
  if (survey.maxResponses && survey.responseCount >= survey.maxResponses) return corsJson({ success: false, message: 'Survey has reached maximum responses' }, { status: 403 });

  const { answers, email, name, source, sourceId, formName, variantId } = await req.json();
  if (!answers || typeof answers !== 'object') return corsJson({ success: false, message: 'Answers are required' }, { status: 400 });

  // Validate variantId — must belong to this survey if provided. Reject
  // mismatches so a tampered client can't spray responses across surveys via
  // an unrelated variant id.
  let resolvedVariantId: number | null = null;
  if (variantId !== undefined && variantId !== null) {
    const parsed = typeof variantId === 'number' ? variantId : parseInt(String(variantId), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return corsJson({ success: false, message: 'Invalid variantId' }, { status: 400 });
    }
    const [variant] = await db.select({ id: surveyVariants.id })
      .from(surveyVariants)
      .where(and(eq(surveyVariants.id, parsed), eq(surveyVariants.surveyId, survey.id)))
      .limit(1);
    if (variant) resolvedVariantId = variant.id;
    // Silently drop unknown variantIds — the variant may have been deleted
    // mid-session. Better to record the response with `variantId=null` than
    // 400 the visitor.
  }

  // formName is required so the dashboard can segment custom-form submissions
  // from structured-survey submissions on the same survey row.
  const trimmedFormName = typeof formName === 'string' ? formName.trim() : '';
  if (!trimmedFormName) {
    return corsJson({ success: false, message: 'formName is required' }, { status: 400 });
  }
  if (trimmedFormName.length > 100) {
    return corsJson({ success: false, message: 'formName must be 100 characters or fewer' }, { status: 400 });
  }

  if (survey.requireEmail && !email?.trim()) {
    return corsJson({ success: false, message: 'Email is required' }, { status: 400 });
  }

  // Validate required fields against the survey's structured schema. When a
  // variant is in play, validate against the variant's field set instead so a
  // visitor who saw variant B isn't rejected for missing variant A's fields.
  // Custom-form submissions skip this — when the survey has no schema, the
  // payload shape is opaque to us, so we trust the caller and store as-is.
  let fields = (survey.fields || []) as { id: string; required: boolean; label: string; type: string }[];
  if (resolvedVariantId !== null) {
    const [variantRow] = await db.select({ fields: surveyVariants.fields })
      .from(surveyVariants)
      .where(eq(surveyVariants.id, resolvedVariantId))
      .limit(1);
    if (variantRow?.fields && Array.isArray(variantRow.fields) && variantRow.fields.length > 0) {
      fields = variantRow.fields as typeof fields;
    }
  }
  if (fields.length > 0) {
    for (const field of fields) {
      if (field.required && field.type !== 'heading') {
        const val = answers[field.id];
        if (val === undefined || val === null || val === '') {
          return corsJson({ success: false, message: `${field.label} is required` }, { status: 400 });
        }
      }
    }
  }

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
  const ua = hdrs.get('user-agent') || null;

  // KNOWN LIMITATION: maxResponses gate at line 69 reads from initial SELECT, not inside
  // the transaction. Under extreme concurrency at exactly max capacity, two requests could
  // both pass the gate. The transaction prevents count desync but not the gate race.
  // See: .planning/phases/01-foundation-and-schema/01-RESEARCH.md — Pitfall 5
  const [response] = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(surveyResponses).values({
      surveyId: survey.id,
      formName: trimmedFormName,
      answers,
      respondentEmail: email?.trim() || null,
      respondentName: name?.trim() || null,
      source: source || 'link',
      sourceId: sourceId || null,
      ipAddress: ip,
      userAgent: ua,
      completedAt: new Date(),
      variantId: resolvedVariantId,
    }).returning();

    await tx
      .update(surveys)
      .set({ responseCount: sql`${surveys.responseCount} + 1`, updatedAt: new Date() })
      .where(eq(surveys.id, survey.id));

    return [inserted];
  });

  // NOTE: emitEvent intentionally outside transaction — slow handlers must not hold DB connection
  emitEvent('survey.response_submitted', survey.clientId, 0, {
    surveyId: survey.id,
    responseId: response.id,
    surveyTitle: survey.title,
    formName: response.formName,
    respondentName: response.respondentName,
    respondentEmail: response.respondentEmail,
    source: response.source,
    answers: response.answers,
  });

  // HOOK-01: fire registered survey webhooks. Fire-and-forget — webhooks must
  // never block (or fail) the public response submission.
  // TODO(HOOK-02 / Phase 4): the dispatcher will swap inline retries for a
  // BullMQ queue once Upstash Redis is provisioned.
  setImmediate(() => {
    dispatchSurveyResponseWebhooks({
      ...response,
      surveyTitle: survey.title,
      surveySlug: survey.slug,
    }).catch((err) => console.error('[survey-webhooks] dispatch failed', err));
  });

  return corsJson({
    success: true,
    data: {
      thankYouTitle: survey.thankYouTitle,
      thankYouMessage: survey.thankYouMessage,
      redirectUrl: survey.redirectUrl,
    },
  }, { status: 201 });
}
