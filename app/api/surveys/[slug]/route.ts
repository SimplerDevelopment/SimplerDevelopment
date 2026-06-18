import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyResponses, surveyVariants, surveyPartialResponses, crmDeals } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { headers } from 'next/headers';
import { getBrandingBySurveySlug, brandingToCssVars } from '@/lib/branding';
import { dispatchSurveyResponseWebhooks } from '@/lib/survey-webhooks/dispatcher';
import { ensureVisitorId } from '@/lib/ab/visitor';
import { assignSurveyVariant } from '@/lib/surveys/variant-assign';
import { computeSurveyScore } from '@/lib/surveys/score';
import type { SurveyFieldDef } from '@/lib/db/schema/surveys';
import { assertPipelineInClient, assertStageInClient } from '@/lib/security/assert-owned';
import { upsertContactByEmail } from '@/lib/crm/contacts';

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
      // PDF-01: surfaced to the public form so it knows whether to render
      // the "Download Certificate" CTA on the thank-you screen.
      certificateEnabled: surveys.certificateEnabled,
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

  const { answers, email, name, source, sourceId, formName, variantId, sessionId } = await req.json();
  if (!answers || typeof answers !== 'object') return corsJson({ success: false, message: 'Answers are required' }, { status: 400 });

  // Optional RESP-02 partial-session handle. Length-bounded + charset-restricted
  // here too because anything wider than 64 chars or off-whitelist would never
  // match a real partial row (same validation as the /partial route).
  const trimmedSessionId =
    typeof sessionId === 'string' && sessionId.trim().length > 0 && sessionId.trim().length <= 64 && /^[A-Za-z0-9_.\-]+$/.test(sessionId.trim())
      ? sessionId.trim()
      : null;

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
          const message = field.type === 'checkbox'
            ? 'Please check the box to agree before continuing.'
            : `${field.label} is required`;
          return corsJson({ success: false, message }, { status: 400 });
        }
      }
    }
  }

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
  const ua = hdrs.get('user-agent') || null;

  // SCORE-01: compute the response score against the served field set
  // BEFORE the transaction so we can persist it alongside the insert.
  // `computeSurveyScore` returns null when no field has a scoring rule —
  // in that case we want to write NULL (not 0) so consumers can tell
  // "unscorable survey" apart from "scored zero".
  const computedScore = computeSurveyScore(
    fields as unknown as SurveyFieldDef[],
    answers as Record<string, unknown>,
  );

  // LEAD-01: many surveys collect contact info as ordinary questions (an
  // `email`-type field, first/last-name text fields) instead of the
  // `requireEmail` prompt — in that case the top-level `email`/`name` arrive
  // empty and the response was saved as "Anonymous" with no email, which also
  // starves the email-followup gate and any CRM routing. Promote those answers
  // to the response's respondent identity. Explicit top-level values win.
  const answerVal = (key: string): string => {
    const v = (answers as Record<string, unknown>)[key];
    return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
  };
  const emailField = fields.find((f) => f.type === 'email');
  const derivedEmail =
    (typeof email === 'string' && email.trim()) ||
    (emailField ? answerVal(emailField.id) : '') ||
    answerVal('email');
  const derivedName =
    (typeof name === 'string' && name.trim()) ||
    [answerVal('first_name'), answerVal('last_name')].filter(Boolean).join(' ') ||
    answerVal('name') ||
    answerVal('full_name');

  // KNOWN LIMITATION: maxResponses gate at line 69 reads from initial SELECT, not inside
  // the transaction. Under extreme concurrency at exactly max capacity, two requests could
  // both pass the gate. The transaction prevents count desync but not the gate race.
  // See: .planning/phases/01-foundation-and-schema/01-RESEARCH.md — Pitfall 5
  const [response] = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(surveyResponses).values({
      surveyId: survey.id,
      formName: trimmedFormName,
      answers,
      respondentEmail: derivedEmail || null,
      respondentName: derivedName || null,
      source: source || 'link',
      sourceId: sourceId || null,
      ipAddress: ip,
      userAgent: ua,
      completedAt: new Date(),
      variantId: resolvedVariantId,
      score: computedScore,
    }).returning();

    await tx
      .update(surveys)
      .set({ responseCount: sql`${surveys.responseCount} + 1`, updatedAt: new Date() })
      .where(eq(surveys.id, survey.id));

    // RESP-02: close out the partial-response row so a returning visitor on
    // the same browser sees a fresh form, not their already-submitted state.
    // No-op when no partial was ever saved for this session.
    if (trimmedSessionId) {
      await tx
        .update(surveyPartialResponses)
        .set({ completed: true, updatedAt: new Date() })
        .where(
          and(
            eq(surveyPartialResponses.surveyId, survey.id),
            eq(surveyPartialResponses.sessionId, trimmedSessionId),
          ),
        );
    }

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

  // SCORE-02: evaluate the survey-level auto-route rule. Best-effort —
  // a CRM hiccup must never fail the public survey submit, so the whole
  // block is wrapped in try/catch and only logs on failure.
  try {
    const autoRoute = survey.scoringConfig?.autoRouteToCrm;
    const respondentEmail = response.respondentEmail;
    if (
      autoRoute?.enabled &&
      computedScore !== null &&
      computedScore >= autoRoute.minScore &&
      respondentEmail
    ) {
      // Verify pipeline + stage still belong to this tenant before insert —
      // protects against stale config pointing at a deleted/moved pipeline.
      await assertPipelineInClient(autoRoute.pipelineId, survey.clientId);
      await assertStageInClient(autoRoute.stageId, survey.clientId);

      const template =
        autoRoute.dealTitleTemplate && autoRoute.dealTitleTemplate.trim().length > 0
          ? autoRoute.dealTitleTemplate
          : 'Survey lead: {surveyTitle}';
      const title = template
        .replace(/\{surveyTitle\}/g, survey.title || '')
        .replace(/\{respondentName\}/g, response.respondentName || '')
        .replace(/\{respondentEmail\}/g, respondentEmail)
        .replace(/\{score\}/g, String(computedScore));

      // Upsert a CRM contact so the deal is never orphaned.
      const { contactId } = await upsertContactByEmail({
        clientId: survey.clientId,
        email: respondentEmail,
        displayName: response.respondentName ?? undefined,
        source: 'survey',
      });

      await db.insert(crmDeals).values({
        clientId: survey.clientId,
        pipelineId: autoRoute.pipelineId,
        stageId: autoRoute.stageId,
        title: title.slice(0, 255),
        notes: `Auto-created from survey response #${response.id}`,
        ownerId: null,
        contactId,
      });
    }
  } catch (err) {
    console.error('[surveys/submit] auto-route to CRM failed', err);
  }

  return corsJson({
    success: true,
    data: {
      thankYouTitle: survey.thankYouTitle,
      thankYouMessage: survey.thankYouMessage,
      redirectUrl: survey.redirectUrl,
      // PDF-01: the inserted row id is echoed back so the public form can
      // build a /api/surveys/<slug>/certificate?responseId=<id> link on the
      // thank-you screen. The id alone isn't sensitive — the certificate
      // route still verifies it belongs to this survey before rendering.
      responseId: response.id,
      certificateEnabled: !!survey.certificateEnabled,
    },
  }, { status: 201 });
}
