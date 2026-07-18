import { describe, it, expect } from 'vitest';
import {
  formatRespondentName,
  formatCompletionDate,
  sanitizeFilename,
  resolvePdfFont,
} from '@/lib/surveys/certificate-helpers';

describe('formatRespondentName', () => {
  it('returns the trimmed name when present', () => {
    expect(formatRespondentName('Jane Doe')).toBe('Jane Doe');
    expect(formatRespondentName('  Jane Doe  ')).toBe('Jane Doe');
  });

  it('falls back to "Respondent" for null / empty input', () => {
    expect(formatRespondentName(null)).toBe('Respondent');
    expect(formatRespondentName(undefined)).toBe('Respondent');
    expect(formatRespondentName('')).toBe('Respondent');
    expect(formatRespondentName('   ')).toBe('Respondent');
  });
});

describe('formatCompletionDate', () => {
  it('formats a Date as "Month Day, Year"', () => {
    // 2026-05-12 UTC noon — well clear of any DST edge.
    const d = new Date('2026-05-12T12:00:00Z');
    expect(formatCompletionDate(d)).toBe('May 12, 2026');
  });

  it('accepts an ISO string', () => {
    expect(formatCompletionDate('2026-01-03T12:00:00Z')).toBe('January 3, 2026');
  });

  it('falls back to today for missing / invalid input', () => {
    // Just verify it doesn't throw and returns a non-empty string — the
    // exact value is `today`, which we don't want to hard-code.
    expect(formatCompletionDate(null).length).toBeGreaterThan(0);
    expect(formatCompletionDate(undefined).length).toBeGreaterThan(0);
    expect(formatCompletionDate('not-a-date').length).toBeGreaterThan(0);
  });
});

describe('sanitizeFilename', () => {
  it('lower-cases and dashes alphanumerics', () => {
    expect(sanitizeFilename('Customer Satisfaction Q3')).toBe('customer-satisfaction-q3');
  });

  it('strips leading/trailing dashes and collapses repeats', () => {
    expect(sanitizeFilename('  --Hello!! World??  ')).toBe('hello-world');
  });

  it('falls back to "survey" when input has no alphanumerics', () => {
    expect(sanitizeFilename('!!!')).toBe('survey');
    expect(sanitizeFilename('')).toBe('survey');
    expect(sanitizeFilename(null)).toBe('survey');
  });

  it('truncates very long titles', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(80);
  });
});

describe('resolvePdfFont', () => {
  it('maps Times-family names to Times-Roman', () => {
    expect(resolvePdfFont('Times New Roman')).toBe('Times-Roman');
    expect(resolvePdfFont('Playfair Serif')).toBe('Times-Roman');
  });

  it('maps Courier / mono names to Courier', () => {
    expect(resolvePdfFont('Courier Prime')).toBe('Courier');
    expect(resolvePdfFont('JetBrains Mono')).toBe('Courier');
  });

  it('falls back to Helvetica for everything else', () => {
    expect(resolvePdfFont('Inter')).toBe('Helvetica');
    expect(resolvePdfFont('Roboto')).toBe('Helvetica');
    expect(resolvePdfFont('')).toBe('Helvetica');
    expect(resolvePdfFont(null)).toBe('Helvetica');
    expect(resolvePdfFont(undefined)).toBe('Helvetica');
  });
});
