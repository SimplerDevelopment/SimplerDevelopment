/**
 * DIST-01 / DIST-02 — eligibility-gate tests for post-submission email
 * follow-up sequences.
 *
 * Covers the matrix of (consent set/unset × answer truthy/falsy/missing)
 * plus condition-field gating and the delay-window edge cases. The cron
 * worker is the only consumer of this helper, but we don't need a DB to
 * exercise the decision branches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDelay,
  isEligibleForFollowup,
  isTruthyAnswer,
  type FollowupGateResponse,
  type FollowupGateSequence,
  type FollowupGateSurvey,
} from '@/lib/surveys/email-followup-gate';

const survey = (consentField: string | null = null): FollowupGateSurvey => ({ consentField });
const seq = (overrides: Partial<FollowupGateSequence> = {}): FollowupGateSequence => ({
  delayHours: 0,
  conditionField: null,
  conditionValue: null,
  ...overrides,
});
const resp = (overrides: Partial<FollowupGateResponse> = {}): FollowupGateResponse => ({
  respondentEmail: 'r@example.com',
  completedAt: new Date('2026-05-12T00:00:00Z'),
  answers: {},
  ...overrides,
});

describe('isTruthyAnswer', () => {
  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    [-1, true],
    ['yes', true],
    ['Yes', true],
    [' true ', true],
    ['no', false],
    ['NO', false],
    ['false', false],
    ['0', false],
    ['off', false],
    ['', false],
    ['   ', false],
    [null, false],
    [undefined, false],
    [[], false],
    [['yes'], true],
    [['no'], false],
    [{ anything: 1 }, true],
  ])('isTruthyAnswer(%j) === %j', (input, expected) => {
    expect(isTruthyAnswer(input)).toBe(expected);
  });
});

describe('isEligibleForFollowup — email & consent gates', () => {
  it('rejects when respondentEmail is missing', () => {
    const r = isEligibleForFollowup(survey(), resp({ respondentEmail: null }), seq());
    expect(r).toEqual({ eligible: false, reason: 'no_email' });
  });

  it('rejects when respondentEmail is empty string', () => {
    const r = isEligibleForFollowup(survey(), resp({ respondentEmail: '   ' }), seq());
    expect(r).toEqual({ eligible: false, reason: 'no_email' });
  });

  it('passes when consentField is null and email is present (back-compat)', () => {
    const r = isEligibleForFollowup(survey(null), resp(), seq());
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe('eligible');
  });

  it('passes when consentField is set and answer is truthy', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: { marketing_opt_in: true } }),
      seq(),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('passes when consentField is set and answer is a truthy string', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: { marketing_opt_in: 'Yes' } }),
      seq(),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('rejects when consentField is set and answer is falsy', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: { marketing_opt_in: false } }),
      seq(),
    );
    expect(r).toEqual({ eligible: false, reason: 'no_consent' });
  });

  it('rejects when consentField is set and answer is the string "No"', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: { marketing_opt_in: 'No' } }),
      seq(),
    );
    expect(r).toEqual({ eligible: false, reason: 'no_consent' });
  });

  it('rejects when consentField is set but the field is missing from answers', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: { other: 'whatever' } }),
      seq(),
    );
    expect(r).toEqual({ eligible: false, reason: 'consent_field_missing_in_answers' });
  });

  it('rejects when consentField is set and the entire answers blob is null', () => {
    const r = isEligibleForFollowup(
      survey('marketing_opt_in'),
      resp({ answers: null }),
      seq(),
    );
    expect(r).toEqual({ eligible: false, reason: 'consent_field_missing_in_answers' });
  });
});

describe('isEligibleForFollowup — per-sequence condition gate', () => {
  it('passes when conditionField match', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ answers: { plan: 'pro' } }),
      seq({ conditionField: 'plan', conditionValue: 'pro' }),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('rejects when conditionField does not match', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ answers: { plan: 'free' } }),
      seq({ conditionField: 'plan', conditionValue: 'pro' }),
    );
    expect(r).toEqual({ eligible: false, reason: 'condition_field_no_match' });
  });

  it('rejects when conditionField is set but answer is missing', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ answers: {} }),
      seq({ conditionField: 'plan', conditionValue: 'pro' }),
    );
    expect(r).toEqual({ eligible: false, reason: 'condition_field_no_match' });
  });

  it('case-sensitive equality for v1 — "Pro" != "pro"', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ answers: { plan: 'Pro' } }),
      seq({ conditionField: 'plan', conditionValue: 'pro' }),
    );
    expect(r.eligible).toBe(false);
  });

  it('coerces number answers to strings before comparison', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ answers: { tier: 5 } }),
      seq({ conditionField: 'tier', conditionValue: '5' }),
    );
    expect(r.eligible).toBe(true);
  });
});

describe('isEligibleForFollowup — delay window', () => {
  // Frozen "now" so the math is deterministic. completedAt + delayHours
  // must be <= now for the row to be eligible.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects when delay has not elapsed yet (now < eligibleAt)', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: new Date('2026-05-12T11:30:00Z') }),
      seq({ delayHours: 1 }),
    );
    expect(r).toEqual({ eligible: false, reason: 'delay_not_elapsed' });
  });

  it('passes exactly at the delay boundary (now == eligibleAt)', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: new Date('2026-05-12T11:00:00Z') }),
      seq({ delayHours: 1 }),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('passes well past the delay boundary', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: new Date('2026-05-10T00:00:00Z') }),
      seq({ delayHours: 1 }),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('treats a zero-delay sequence as "send immediately on/after completion"', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: new Date('2026-05-12T12:00:00Z') }),
      seq({ delayHours: 0 }),
    );
    expect(r).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('rejects when completedAt is null', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: null }),
      seq({ delayHours: 0 }),
    );
    expect(r).toEqual({ eligible: false, reason: 'no_completed_at' });
  });

  it('rejects when completedAt is an unparseable string', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: 'not-a-date' }),
      seq({ delayHours: 0 }),
    );
    expect(r).toEqual({ eligible: false, reason: 'no_completed_at' });
  });

  it('accepts an ISO string for completedAt', () => {
    const r = isEligibleForFollowup(
      survey(),
      resp({ completedAt: '2026-05-12T11:00:00Z' }),
      seq({ delayHours: 1 }),
    );
    expect(r.eligible).toBe(true);
  });
});

describe('formatDelay', () => {
  it.each([
    [0, 'Immediately'],
    [1, '1h'],
    [2, '2h'],
    [23, '23h'],
    [24, '1d'],
    [25, '1d 1h'],
    [28, '1d 4h'],
    [48, '2d'],
    [-1, '0h'],
    [Number.NaN, '0h'],
  ])('formatDelay(%j) === %j', (input, expected) => {
    expect(formatDelay(input)).toBe(expected);
  });
});
