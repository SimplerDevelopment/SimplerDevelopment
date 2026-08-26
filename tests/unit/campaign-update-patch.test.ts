/**
 * Pins that an email-campaign PATCH cannot destroy a field the caller never
 * mentioned.
 *
 * JUL9-014. Two REST handlers hand-rolled the same `.set({...})` object and
 * drifted into the same bug: most fields merged with a conditional spread,
 * but `previewText`, `replyTo`, `scheduledAt` and `status` were assigned
 * unconditionally. The `status` one is the reason this is a data-loss bug
 * rather than a cosmetic one — a `scheduled` campaign is still editable, so
 * renaming one omitted `scheduledAt`, which nulled the send time and reverted
 * `status` to `draft`. HTTP 200, no warning, campaign silently unscheduled.
 *
 * Both routes now share buildCampaignUpdatePatch. These cover what the
 * builder must do, plus a guard that neither call site hand-rolls one again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCampaignUpdatePatch } from '@/lib/email/campaign-update-patch';

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

describe('buildCampaignUpdatePatch — omitted means leave alone', () => {
  // The original bug, stated as tests. Each of these four was written
  // unconditionally before the fix.
  it('does not touch previewText or replyTo when they are omitted', () => {
    const patch = buildCampaignUpdatePatch({ name: 'Just a rename' });
    expect(has(patch, 'previewText'), 'previewText would be nulled').toBe(false);
    expect(has(patch, 'replyTo'), 'replyTo would be nulled').toBe(false);
  });

  it('does not touch scheduledAt or status when scheduledAt is omitted', () => {
    // THE bug: this is what silently unscheduled a campaign on an unrelated edit.
    const patch = buildCampaignUpdatePatch({ name: 'Just a rename' });
    expect(has(patch, 'scheduledAt'), 'scheduledAt would be nulled').toBe(false);
    expect(has(patch, 'status'), 'status would revert to draft').toBe(false);
  });

  it('leaves a scheduled campaign scheduled when an A/B field is toggled', () => {
    // The realistic repro, end to end: the caller sends only abEnabled.
    const patch = buildCampaignUpdatePatch({ abEnabled: true });
    expect(patch.abEnabled).toBe(true);
    expect(has(patch, 'status')).toBe(false);
    expect(has(patch, 'scheduledAt')).toBe(false);
  });
});

describe('buildCampaignUpdatePatch — explicit null still clears', () => {
  // The other half: omission and explicit null are DIFFERENT intents, and
  // collapsing them would break the UI's "clear this field" affordances.
  it('clears previewText and replyTo when explicitly null', () => {
    const patch = buildCampaignUpdatePatch({ previewText: null, replyTo: null });
    expect(patch.previewText).toBeNull();
    expect(patch.replyTo).toBeNull();
  });

  it('clears them when explicitly empty/whitespace', () => {
    const patch = buildCampaignUpdatePatch({ previewText: '', replyTo: '   ' });
    expect(patch.previewText).toBeNull();
    expect(patch.replyTo).toBeNull();
  });

  it('unschedules when scheduledAt is explicitly null', () => {
    const patch = buildCampaignUpdatePatch({ scheduledAt: null });
    expect(patch.scheduledAt).toBeNull();
    expect(patch.status).toBe('draft');
  });

  it('schedules when scheduledAt is supplied', () => {
    const patch = buildCampaignUpdatePatch({ scheduledAt: '2026-09-01T10:00:00.000Z' });
    expect(patch.scheduledAt).toBeInstanceOf(Date);
    expect((patch.scheduledAt as Date).toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(patch.status).toBe('scheduled');
  });
});

describe('buildCampaignUpdatePatch — supplied values carry through', () => {
  it('carries every supplied field', () => {
    const patch = buildCampaignUpdatePatch({
      name: ' Launch ', subject: ' Hi ', previewText: ' peek ',
      fromName: ' SD ', fromEmail: ' a@b.co ', replyTo: ' r@b.co ',
      htmlContent: ' <p>x</p> ', useBlockEditor: true, abEnabled: true,
      abSubjectB: ' Alt ', abWinnerMetric: 'click', abTestSizePct: 20.4,
    });
    expect(patch.name).toBe('Launch');
    expect(patch.subject).toBe('Hi');
    expect(patch.previewText).toBe('peek');
    expect(patch.fromName).toBe('SD');
    expect(patch.fromEmail).toBe('a@b.co');
    expect(patch.replyTo).toBe('r@b.co');
    expect(patch.htmlContent).toBe('<p>x</p>');
    expect(patch.useBlockEditor).toBe(true);
    expect(patch.abEnabled).toBe(true);
    expect(patch.abSubjectB).toBe('Alt');
    expect(patch.abWinnerMetric).toBe('click');
    expect(patch.abTestSizePct).toBe(20);
  });

  // Deliberately preserved from the original `...(name && )` behaviour: a
  // blank name is not a meaningful value, so it means "not supplied" rather
  // than "write an empty campaign name". This was never part of the bug.
  it('ignores a blank name or subject rather than writing one', () => {
    const patch = buildCampaignUpdatePatch({ name: '   ', subject: '' });
    expect(has(patch, 'name')).toBe(false);
    expect(has(patch, 'subject')).toBe(false);
  });

  it('rejects an out-of-range abTestSizePct and an unknown winner metric', () => {
    const patch = buildCampaignUpdatePatch({ abTestSizePct: 90, abWinnerMetric: 'vibes' });
    expect(has(patch, 'abTestSizePct')).toBe(false);
    expect(has(patch, 'abWinnerMetric')).toBe(false);
  });

  it('always bumps updatedAt', () => {
    expect(buildCampaignUpdatePatch({}).updatedAt).toBeInstanceOf(Date);
  });
});

describe('both campaign PATCH routes use the shared builder', () => {
  const root = process.cwd();

  it.each([
    ['app/api/portal/email/campaigns/[id]/route.ts'],
    ['app/api/admin/email/campaigns/[id]/route.ts'],
  ])('%s routes its update through buildCampaignUpdatePatch', (file) => {
    const src = readFileSync(join(root, file), 'utf8');
    expect(src, `${file} no longer calls buildCampaignUpdatePatch`).toContain('buildCampaignUpdatePatch(');

    // The exact shapes that WERE the bug. Reintroducing either means a second,
    // driftable copy of the field list — which is how both routes acquired the
    // identical defect in the first place.
    expect(
      /previewText:\s*previewText\?\.trim\(\)\s*\|\|\s*null/.test(src),
      `${file} hand-rolls an unconditional previewText assignment again`,
    ).toBe(false);
    expect(
      /status:\s*scheduledAt\s*\?\s*'scheduled'\s*:\s*'draft'/.test(src),
      `${file} derives status unconditionally again — this silently unschedules campaigns`,
    ).toBe(false);
  });
});
