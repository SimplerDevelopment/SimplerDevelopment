/**
 * RESP-03: shared validation for the public survey file-upload endpoint.
 *
 * The /api/surveys/[slug]/upload route is unauthenticated (survey
 * respondents are anonymous), so the server-side allow-list is the only gate
 * between an attacker and our S3 bucket. Keep this list tight, and prefer
 * rejecting anything ambiguous.
 *
 * Extracted from the route module so unit tests can exercise the predicate
 * without spinning up a Next request pipeline.
 */

/** Maximum bytes accepted for a single survey upload. 10 MB. */
export const MAX_SURVEY_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * MIME types the survey upload endpoint accepts. Whitelist, not blocklist —
 * anything not on this list is rejected with 415.
 */
export const ALLOWED_SURVEY_UPLOAD_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
] as const;

/**
 * MIME types we explicitly reject even if a future whitelist relaxation
 * accidentally lets them through. Defense in depth against the stored-XSS
 * vectors flagged in the 2026-05-06 security audit (C3/C4).
 */
export const BLOCKED_SURVEY_UPLOAD_MIMES = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
] as const;

export type SurveyUploadValidationError =
  | 'empty'
  | 'too_large'
  | 'blocked_type'
  | 'disallowed_type';

export interface ValidateUploadedFileInput {
  contentType: string | null | undefined;
  size: number;
}

export interface ValidateUploadedFileSuccess {
  ok: true;
  contentType: (typeof ALLOWED_SURVEY_UPLOAD_MIMES)[number];
}

export interface ValidateUploadedFileFailure {
  ok: false;
  error: SurveyUploadValidationError;
  message: string;
}

export type ValidateUploadedFileResult =
  | ValidateUploadedFileSuccess
  | ValidateUploadedFileFailure;

/** Strip any `;charset=…` suffix and lowercase. */
function normalizeMime(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.toLowerCase().split(';')[0].trim();
}

/**
 * Returns a typed Ok/Err result describing whether the supplied file would be
 * accepted by the survey upload endpoint. The route handler bails to the
 * matching HTTP status (413 / 415 / 400) based on `error`.
 */
export function validateUploadedFile(
  input: ValidateUploadedFileInput,
): ValidateUploadedFileResult {
  const { size } = input;
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'empty', message: 'File is empty' };
  }
  if (size > MAX_SURVEY_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'too_large',
      message: `File exceeds ${MAX_SURVEY_UPLOAD_BYTES} byte cap`,
    };
  }

  const mime = normalizeMime(input.contentType);
  if (!mime) {
    return {
      ok: false,
      error: 'disallowed_type',
      message: 'Missing content-type',
    };
  }
  if ((BLOCKED_SURVEY_UPLOAD_MIMES as readonly string[]).includes(mime)) {
    return {
      ok: false,
      error: 'blocked_type',
      message: `Content type ${mime} is not allowed`,
    };
  }
  if (!(ALLOWED_SURVEY_UPLOAD_MIMES as readonly string[]).includes(mime)) {
    return {
      ok: false,
      error: 'disallowed_type',
      message: `Content type ${mime} is not allowed`,
    };
  }
  return {
    ok: true,
    contentType: mime as (typeof ALLOWED_SURVEY_UPLOAD_MIMES)[number],
  };
}

/**
 * Sanitize a user-supplied filename for use inside an S3 key. Strips path
 * separators and anything outside `[A-Za-z0-9._-]`, and caps length. Never
 * returns an empty string — falls back to `upload`.
 */
export function sanitizeUploadFilename(raw: string | null | undefined): string {
  if (!raw) return 'upload';
  // Take only the basename in case a client sent `../../etc/passwd`.
  const basename = raw.split(/[\\/]/).pop() || '';
  // Replace anything not safe with `_`. Keep dots so the extension survives.
  const cleaned = basename.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return 'upload';
  return cleaned.slice(0, 120);
}
