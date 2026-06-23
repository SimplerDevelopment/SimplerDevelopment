/**
 * PDF-01/02 — public branded completion certificate.
 *
 * GET /api/surveys/[slug]/certificate?responseId=<n>
 *
 * Renders an `application/pdf` document showing the survey title, the
 * respondent's name (falls back to "Respondent" when anonymous), and the
 * completion date — themed with the survey's resolved branding profile
 * (primary color, logo, fonts). Gated by `surveys.certificate_enabled`;
 * returns 404 when the survey is missing OR opt-out OR the response id
 * doesn't belong to this survey (no existence leak).
 *
 * Runtime: Node (NOT Edge) — `@react-pdf/renderer` uses Node-only APIs
 * (Buffer, streams) that the Edge runtime doesn't expose.
 */

import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getBrandingBySurveySlug } from '@/lib/branding';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { createElement } from 'react';
import {
  formatRespondentName,
  formatCompletionDate,
  sanitizeFilename,
  resolvePdfFont,
} from '@/lib/surveys/certificate-helpers';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const responseIdParam = url.searchParams.get('responseId');
  const responseId = responseIdParam ? parseInt(responseIdParam, 10) : NaN;

  if (!Number.isFinite(responseId) || responseId <= 0) {
    return new Response('Not found', { status: 404 });
  }

  const [survey] = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      certificateEnabled: surveys.certificateEnabled,
    })
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  // Same 404 for missing-survey and opt-out so callers can't probe for slugs.
  if (!survey || !survey.certificateEnabled) {
    return new Response('Not found', { status: 404 });
  }

  // Cross-survey isolation: require the response to belong to this survey.
  // Mismatch returns 404 — never leak that a response id exists elsewhere.
  const [response] = await db
    .select({
      id: surveyResponses.id,
      respondentName: surveyResponses.respondentName,
      completedAt: surveyResponses.completedAt,
      createdAt: surveyResponses.createdAt,
    })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.id, responseId), eq(surveyResponses.surveyId, survey.id)))
    .limit(1);

  if (!response) {
    return new Response('Not found', { status: 404 });
  }

  const branding = await getBrandingBySurveySlug(slug);

  const primary = branding?.primaryColor || '#2563eb';
  const accent = branding?.accentColor || '#f59e0b';
  const headingFont = resolvePdfFont(branding?.headingFont);
  const bodyFont = resolvePdfFont(branding?.bodyFont);
  const logoUrl = branding?.logoUrl || branding?.logoRectUrl || '';

  const respondentName = formatRespondentName(response.respondentName);
  const completionDate = formatCompletionDate(response.completedAt ?? response.createdAt);

  const styles = StyleSheet.create({
    page: {
      padding: 0,
      fontFamily: bodyFont,
      backgroundColor: '#ffffff',
      color: '#111827',
    },
    headerBand: {
      backgroundColor: primary,
      paddingTop: 36,
      paddingBottom: 36,
      paddingHorizontal: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLogo: {
      maxHeight: 40,
      maxWidth: 140,
      objectFit: 'contain',
    },
    headerTitle: {
      color: '#ffffff',
      fontFamily: headingFont,
      fontSize: 16,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    body: {
      paddingTop: 64,
      paddingBottom: 64,
      paddingHorizontal: 64,
      alignItems: 'center',
      textAlign: 'center',
    },
    eyebrow: {
      fontFamily: bodyFont,
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: '#6b7280',
      marginBottom: 16,
    },
    headline: {
      fontFamily: headingFont,
      fontSize: 34,
      color: '#111827',
      marginBottom: 32,
    },
    awardedTo: {
      fontFamily: bodyFont,
      fontSize: 12,
      color: '#6b7280',
      marginBottom: 8,
    },
    recipient: {
      fontFamily: headingFont,
      fontSize: 28,
      color: primary,
      marginBottom: 28,
    },
    divider: {
      width: 80,
      height: 2,
      backgroundColor: accent,
      marginBottom: 28,
    },
    forCompletion: {
      fontFamily: bodyFont,
      fontSize: 12,
      color: '#374151',
      marginBottom: 6,
    },
    surveyTitle: {
      fontFamily: headingFont,
      fontSize: 18,
      color: '#111827',
      fontStyle: 'italic',
      marginBottom: 36,
    },
    dateLabel: {
      fontFamily: bodyFont,
      fontSize: 11,
      color: '#6b7280',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    dateValue: {
      fontFamily: headingFont,
      fontSize: 14,
      color: '#111827',
    },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
    },
    footerText: {
      fontFamily: bodyFont,
      fontSize: 9,
      color: '#9ca3af',
    },
  });

  const headerChildren = [
    logoUrl
      ? createElement(Image, { key: 'logo', src: logoUrl, style: styles.headerLogo })
      : createElement(View, { key: 'logo-spacer' }),
    createElement(
      Text,
      { key: 'title', style: styles.headerTitle },
      survey.title,
    ),
  ];

  const bodyChildren = [
    createElement(Text, { key: 'eyebrow', style: styles.eyebrow }, 'Certificate'),
    createElement(Text, { key: 'headline', style: styles.headline }, 'Certificate of Completion'),
    createElement(Text, { key: 'awarded', style: styles.awardedTo }, 'Awarded to'),
    createElement(Text, { key: 'recipient', style: styles.recipient }, respondentName),
    createElement(View, { key: 'divider', style: styles.divider }),
    createElement(Text, { key: 'for-completion', style: styles.forCompletion }, 'for completing'),
    createElement(Text, { key: 'survey-title', style: styles.surveyTitle }, survey.title),
    createElement(Text, { key: 'date-label', style: styles.dateLabel }, 'Date of completion'),
    createElement(Text, { key: 'date-value', style: styles.dateValue }, completionDate),
  ];

  const footerChildren = [
    createElement(
      Text,
      { key: 'footer', style: styles.footerText },
      `Completion ID: ${response.id}`,
    ),
  ];

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'LETTER', orientation: 'landscape', style: styles.page },
      createElement(View, { style: styles.headerBand }, ...headerChildren),
      createElement(View, { style: styles.body }, ...bodyChildren),
      createElement(View, { style: styles.footer }, ...footerChildren),
    ),
  );

  const buffer = await renderToBuffer(doc);

  const filenameBase = sanitizeFilename(survey.title);
  const filename = `${filenameBase}-certificate.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
