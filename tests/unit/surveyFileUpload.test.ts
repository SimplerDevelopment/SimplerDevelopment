/**
 * RESP-03: server-side gate for /api/surveys/[slug]/upload.
 *
 * These tests exercise the predicate the route uses, not the route itself.
 * The route adds: survey lookup + active-status check + S3 PUT — covered by
 * integration / e2e separately.
 *
 * Security goal: anything outside the allow-list bails with `disallowed_type`,
 * and known XSS vectors are explicitly classified as `blocked_type` even
 * though `disallowed_type` would also catch them. Defense in depth — a future
 * relaxation of the allow-list must not silently re-enable HTML/JS/SVG.
 */

import { describe, it, expect } from 'vitest';
import {
  ALLOWED_SURVEY_UPLOAD_MIMES,
  BLOCKED_SURVEY_UPLOAD_MIMES,
  MAX_SURVEY_UPLOAD_BYTES,
  sanitizeUploadFilename,
  validateUploadedFile,
} from '@/lib/surveys/upload-validation';

describe('validateUploadedFile — allow-listed MIME types', () => {
  for (const mime of ALLOWED_SURVEY_UPLOAD_MIMES) {
    it(`accepts ${mime}`, () => {
      const result = validateUploadedFile({ contentType: mime, size: 1024 });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.contentType).toBe(mime);
    });
  }

  it('accepts a content-type with a charset suffix', () => {
    // Browsers commonly tack on `;charset=utf-8` for text/* types.
    const result = validateUploadedFile({
      contentType: 'text/plain; charset=utf-8',
      size: 100,
    });
    expect(result.ok).toBe(true);
  });

  it('is case-insensitive on content-type', () => {
    const result = validateUploadedFile({
      contentType: 'Image/PNG',
      size: 100,
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateUploadedFile — blocked / disallowed MIME types', () => {
  for (const mime of BLOCKED_SURVEY_UPLOAD_MIMES) {
    it(`rejects ${mime} as blocked_type`, () => {
      const result = validateUploadedFile({ contentType: mime, size: 100 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('blocked_type');
    });
  }

  it('rejects text/html with charset', () => {
    const result = validateUploadedFile({
      contentType: 'text/html; charset=utf-8',
      size: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('blocked_type');
  });

  it('rejects application/octet-stream as disallowed_type', () => {
    const result = validateUploadedFile({
      contentType: 'application/octet-stream',
      size: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('disallowed_type');
  });

  it('rejects an exotic type not on either list', () => {
    const result = validateUploadedFile({
      contentType: 'application/x-msdownload',
      size: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('disallowed_type');
  });

  it('rejects missing / empty content-type', () => {
    const result = validateUploadedFile({ contentType: '', size: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('disallowed_type');
  });

  it('rejects null content-type', () => {
    const result = validateUploadedFile({ contentType: null, size: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('disallowed_type');
  });
});

describe('validateUploadedFile — size bounds', () => {
  it('rejects 0-byte uploads as empty', () => {
    const result = validateUploadedFile({
      contentType: 'image/png',
      size: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty');
  });

  it('rejects negative sizes as empty (paranoia)', () => {
    const result = validateUploadedFile({
      contentType: 'image/png',
      size: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty');
  });

  it('rejects non-finite sizes as empty (paranoia)', () => {
    const result = validateUploadedFile({
      contentType: 'image/png',
      size: Number.POSITIVE_INFINITY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty');
  });

  it('rejects payloads over the 10 MB cap as too_large', () => {
    const result = validateUploadedFile({
      contentType: 'image/png',
      size: MAX_SURVEY_UPLOAD_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('too_large');
  });

  it('accepts a payload exactly at the 10 MB cap', () => {
    const result = validateUploadedFile({
      contentType: 'image/png',
      size: MAX_SURVEY_UPLOAD_BYTES,
    });
    expect(result.ok).toBe(true);
  });
});

describe('sanitizeUploadFilename', () => {
  it('returns "upload" for empty / nullish input', () => {
    expect(sanitizeUploadFilename('')).toBe('upload');
    expect(sanitizeUploadFilename(null)).toBe('upload');
    expect(sanitizeUploadFilename(undefined)).toBe('upload');
  });

  it('strips path separators (no traversal)', () => {
    expect(sanitizeUploadFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeUploadFilename('C:\\Windows\\evil.exe')).toBe('evil.exe');
  });

  it('replaces unsafe characters with underscore', () => {
    const out = sanitizeUploadFilename('my file (1).png');
    // Spaces and parens collapse to a single _ each.
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(out.endsWith('.png')).toBe(true);
  });

  it('keeps the extension intact', () => {
    expect(sanitizeUploadFilename('contract.pdf')).toBe('contract.pdf');
  });

  it('caps length at 120 chars', () => {
    const long = 'a'.repeat(500) + '.png';
    const out = sanitizeUploadFilename(long);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});
