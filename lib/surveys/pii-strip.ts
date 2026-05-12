/**
 * Survey response PII scrubber (AI-02).
 *
 * Conservatively redacts personally-identifying tokens from free-text survey
 * answers before they're sent to the LLM. Two layers:
 *
 *   1. Field-level: answers whose field `type` is `email` / `phone` are
 *      dropped wholesale. The whole point of those fields is to capture
 *      PII; there's no question text to summarize.
 *
 *   2. Substring-level: within text/textarea answers, email-shaped, phone-
 *      shaped, and URL-shaped tokens are replaced with placeholders. This
 *      catches respondents who pasted "email me at jane@example.com" into
 *      a free-text box.
 *
 * The scrubber is intentionally over-eager — false positives (a stray phone
 * number in product feedback) are harmless; false negatives leak PII.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// Phone matcher: a digit-group sequence with optional country code, parens,
// dashes, dots, or spaces. Requires at least 7 digits so we don't strip
// numeric ratings or counts.
const PHONE_RE = /(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{3}\)?[ .-]?)?\d{3}[ .-]?\d{4}\b/g;

// URL matcher — protocol-prefixed only, so we don't redact "example.com"
// when the respondent meant the company name.
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

export interface PiiStripStats {
  emails: number;
  phones: number;
  urls: number;
}

export function stripPiiFromText(text: string, stats?: PiiStripStats): string {
  let out = text;
  out = out.replace(EMAIL_RE, () => {
    if (stats) stats.emails++;
    return '[email]';
  });
  out = out.replace(URL_RE, () => {
    if (stats) stats.urls++;
    return '[url]';
  });
  // Phone replacement runs last so we don't accidentally clobber digits
  // inside a URL that was already redacted.
  out = out.replace(PHONE_RE, (match) => {
    // Skip very-short matches (URLs/emails already redacted may leave digit
    // runs like "[url]4567" — the boundary lets `\b` keep working).
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7) return match;
    if (stats) stats.phones++;
    return '[phone]';
  });
  return out;
}

/** Field types whose values are always PII; the whole field is dropped. */
export const ALWAYS_PII_FIELD_TYPES = new Set(['email', 'phone']);

/** Build a sample-only answer record with PII scrubbed. */
export function stripPiiFromAnswers(
  answers: Record<string, unknown>,
  fields: { id: string; type: string }[],
): { scrubbed: Record<string, unknown>; stats: PiiStripStats } {
  const fieldTypeById = new Map(fields.map((f) => [f.id, f.type]));
  const scrubbed: Record<string, unknown> = {};
  const stats: PiiStripStats = { emails: 0, phones: 0, urls: 0 };

  for (const [fieldId, val] of Object.entries(answers)) {
    const type = fieldTypeById.get(fieldId);
    if (type && ALWAYS_PII_FIELD_TYPES.has(type)) {
      // Skip the entire answer — the field's purpose is to collect PII.
      continue;
    }
    if (typeof val === 'string') {
      scrubbed[fieldId] = stripPiiFromText(val, stats);
    } else {
      // Non-string values (numbers, arrays, booleans) pass through unchanged.
      scrubbed[fieldId] = val;
    }
  }

  return { scrubbed, stats };
}
