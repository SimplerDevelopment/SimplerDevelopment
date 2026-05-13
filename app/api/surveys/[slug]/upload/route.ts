/**
 * RESP-03: public file upload for survey respondents.
 *
 *   POST /api/surveys/[slug]/upload   multipart/form-data, field name `file`
 *
 * Anonymous — survey respondents are not logged in — so this endpoint is the
 * gate. Hardening:
 *   - Survey must exist and be `status='active'` (mirrors the submit route).
 *   - 10 MB body cap, enforced after we've read the multipart payload.
 *   - MIME allow-list (see `lib/surveys/upload-validation.ts`). HTML / SVG /
 *     JS are explicitly blocked even if they slip the allow-list — the
 *     2026-05-06 security audit (C3/C4) classified these as stored-XSS
 *     vectors via /api/media/proxy on the app origin.
 *   - S3 key is namespaced by `clientId/surveyId/`, so a URL leaked from one
 *     tenant can't be guessed against another.
 *   - We never echo the user-supplied Content-Type back — `uploadToS3` writes
 *     the validated, allow-listed MIME, not whatever the browser claimed.
 *
 * Returns `{ success: true, data: { url, filename, size, contentType } }`.
 * The respondent client stores `url` as the field answer; the submit handler
 * treats it like any other string value and persists it into `answers` JSON.
 *
 * Same CORS posture as the parent submit route — sandboxed iframes set
 * `Origin: null`, so we have to echo `Access-Control-Allow-Origin: *`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadToS3 } from '@/lib/s3/upload';
import {
  MAX_SURVEY_UPLOAD_BYTES,
  sanitizeUploadFilename,
  validateUploadedFile,
} from '@/lib/surveys/upload-validation';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function corsJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * Next 16 honours `route.ts`-level body-size config for the multipart parser;
 * this gives us a hard ceiling before we even decode the form. The runtime
 * may still allow slightly larger raw bodies (the multipart frame adds
 * overhead), so we re-check size after parsing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Resolve survey by slug — we need clientId + id for the tenant-scoped S3
  // key, and we must enforce the active-status gate the same way the submit
  // route does (so draft / closed surveys can't be used as a free S3 bucket).
  const [survey] = await db
    .select({
      id: surveys.id,
      clientId: surveys.clientId,
      status: surveys.status,
    })
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  if (!survey) {
    return corsJson({ success: false, message: 'Survey not found' }, { status: 404 });
  }
  if (survey.status !== 'active') {
    return corsJson(
      { success: false, message: 'Survey is not active' },
      { status: 403 },
    );
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return corsJson(
      { success: false, message: 'Expected multipart/form-data' },
      { status: 400 },
    );
  }

  let formData: globalThis.FormData;
  try {
    formData = (await req.formData()) as unknown as globalThis.FormData;
  } catch {
    // request.formData() throws on malformed bodies; surface as a 400 instead
    // of a 500 so the client gets actionable feedback.
    return corsJson(
      { success: false, message: 'Invalid multipart body' },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return corsJson(
      { success: false, message: 'No file provided (expected field name "file")' },
      { status: 400 },
    );
  }

  const originalName =
    (file as File).name && typeof (file as File).name === 'string'
      ? (file as File).name
      : 'upload';
  const browserMime = file.type || '';

  const validation = validateUploadedFile({
    contentType: browserMime,
    size: file.size,
  });
  if (!validation.ok) {
    // Map validation errors to HTTP statuses. Anything other than
    // size-limit is 415 (unsupported media type); empty is 400.
    const status =
      validation.error === 'too_large'
        ? 413
        : validation.error === 'empty'
          ? 400
          : 415;
    return corsJson(
      { success: false, message: validation.message },
      { status },
    );
  }

  // Defense in depth — the validator already enforces the cap, but re-check
  // the actual buffer length so a lying Content-Length header can't sneak by.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > MAX_SURVEY_UPLOAD_BYTES) {
    return corsJson(
      {
        success: false,
        message: `File exceeds ${MAX_SURVEY_UPLOAD_BYTES} byte cap`,
      },
      { status: 413 },
    );
  }

  const safeName = sanitizeUploadFilename(originalName);
  const objectId = randomUUID();
  // Tenant-isolated key: client/survey both in the path so a leaked URL from
  // one tenant can't be twiddled to point at another's bucket prefix.
  const key = `survey-uploads/${survey.clientId}/${survey.id}/${objectId}-${safeName}`;

  let uploadResult;
  try {
    uploadResult = await uploadToS3(buffer, safeName, validation.contentType, {
      key,
    });
  } catch (err) {
    console.error('[survey-upload] s3 put failed', err);
    return corsJson(
      { success: false, message: 'Upload failed' },
      { status: 500 },
    );
  }

  return corsJson({
    success: true,
    data: {
      url: uploadResult.url,
      filename: safeName,
      size: buffer.byteLength,
      contentType: validation.contentType,
    },
  });
}
