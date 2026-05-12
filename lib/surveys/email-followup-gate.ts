/**
 * DIST-01 / DIST-02 eligibility helper for post-submission email
 * follow-up sequences. Lifted out of the cron worker so the pure logic
 * stays unit-testable without spinning up a database.
 *
 * The cron worker handles the SQL plumbing (loading rows, the "already
 * sent?" lookup, the delay-window filter at the DB level for efficiency)
 * but defers the per-row eligibility decision to this helper so all
 * decision branches are covered by tests.
 *
 * Inputs are deliberately narrow so this helper doesn't bind to the full
 * Drizzle row types — that way the cron worker and tests can both feed
 * it minimal shapes.
 */

export interface FollowupGateSurvey {
  /**
   * Field id whose truthy answer represents the respondent's consent to
   * receive follow-ups. When null, email presence alone is sufficient
   * (back-compat for surveys created before the consent_field column existed).
   */
  consentField: string | null;
}

export interface FollowupGateResponse {
  respondentEmail: string | null;
  completedAt: Date | string | null;
  answers: Record<string, unknown> | null | undefined;
}

export interface FollowupGateSequence {
  delayHours: number;
  conditionField: string | null;
  conditionValue: string | null;
}

/**
 * Coerce an answer value to a boolean for the consent-gate check.
 *
 * Truthy: boolean true; non-empty strings except literal "false"/"no"/"0"/"off";
 *         numbers != 0; arrays with at least one truthy entry.
 * Falsy:  undefined/null; empty string; literal "false"/"no"/"0"/"off"
 *         (case-insensitive, trimmed); 0; empty array.
 */
export function isTruthyAnswer(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === '') return false;
    if (trimmed === 'false' || trimmed === 'no' || trimmed === '0' || trimmed === 'off') return false;
    return true;
  }
  if (Array.isArray(val)) {
    return val.some(isTruthyAnswer);
  }
  // Objects fall through to truthy — there's no useful "falsy object" semantics
  // for a survey checkbox/radio answer; if it's a non-null object the user
  // selected *something*.
  return true;
}

/**
 * Should a follow-up email be sent for this (survey, response, sequence)
 * tuple at `now`?
 *
 * Returns the structured reason so the cron worker can log "scanned 100,
 * eligible 12, skipped 88 (43 not_consented, 30 delay_not_elapsed, ...)".
 */
export type EligibilityReason =
  | 'eligible'
  | 'no_email'
  | 'no_consent'
  | 'consent_field_missing_in_answers'
  | 'condition_field_no_match'
  | 'delay_not_elapsed'
  | 'no_completed_at';

export function isEligibleForFollowup(
  survey: FollowupGateSurvey,
  response: FollowupGateResponse,
  sequence: FollowupGateSequence,
  now: Date = new Date(),
): { eligible: boolean; reason: EligibilityReason } {
  // Email is the universal prerequisite — even when the survey doesn't have
  // an explicit consent field, we cannot send mail without an address.
  if (!response.respondentEmail || !response.respondentEmail.trim()) {
    return { eligible: false, reason: 'no_email' };
  }

  const answers = response.answers ?? {};

  // DIST-02 opt-in gate. When the survey has consentField set, the answer
  // must exist AND be truthy. Missing answer is treated as no-consent — we
  // never opportunistically send to a respondent who didn't make a positive
  // election.
  if (survey.consentField) {
    if (!(survey.consentField in answers)) {
      return { eligible: false, reason: 'consent_field_missing_in_answers' };
    }
    if (!isTruthyAnswer(answers[survey.consentField])) {
      return { eligible: false, reason: 'no_consent' };
    }
  }

  // Optional per-sequence condition. String equality (case-sensitive) for v1.
  if (sequence.conditionField) {
    const answer = answers[sequence.conditionField];
    const want = sequence.conditionValue ?? '';
    const have = answer === undefined || answer === null ? '' : String(answer);
    if (have !== want) {
      return { eligible: false, reason: 'condition_field_no_match' };
    }
  }

  // Delay window. completedAt + delayHours must be <= now.
  if (!response.completedAt) {
    return { eligible: false, reason: 'no_completed_at' };
  }
  const completedAt =
    response.completedAt instanceof Date ? response.completedAt : new Date(response.completedAt);
  if (Number.isNaN(completedAt.getTime())) {
    return { eligible: false, reason: 'no_completed_at' };
  }
  const eligibleAt = new Date(completedAt.getTime() + sequence.delayHours * 60 * 60 * 1000);
  if (eligibleAt.getTime() > now.getTime()) {
    return { eligible: false, reason: 'delay_not_elapsed' };
  }

  return { eligible: true, reason: 'eligible' };
}

/**
 * Format a delay in hours as a human-readable "1d 4h" / "2h" / "30m".
 * The cron + UI both consume this so the dashboard and audit logs agree.
 */
export function formatDelay(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '0h';
  if (hours === 0) return 'Immediately';
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0 && remHours > 0) return `${days}d ${remHours}h`;
  if (days > 0) return `${days}d`;
  return `${remHours}h`;
}
