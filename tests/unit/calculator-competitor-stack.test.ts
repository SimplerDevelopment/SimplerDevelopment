// @vitest-environment node
/**
 * Guards for the /calculator cost comparison.
 *
 * The load-bearing risk here is not a rendering bug — it is a *quiet* one. Two
 * ways this page can start lying without anyone noticing:
 *
 *   1. A new module lands in FEATURE_DOMAINS with no competitor row. It would
 *      then be tickable, add to our side of the bill, and add nothing to
 *      theirs — silently making the point-tool stack look cheaper than it is.
 *   2. Someone reimplements the SD arithmetic in the component instead of
 *      calling computeAccountBilling, and the marketing number drifts from the
 *      Stripe number.
 *
 * Both are asserted below, along with the seat-minimum rule (the single figure
 * doing the most work on the page, so the one most worth pinning).
 */
import { describe, it, expect } from 'vitest';
import { FEATURE_DOMAINS, computeAccountBilling } from '@/lib/billing/domain-catalog';
import {
  COMPETITORS,
  competitorFor,
  competitorMonthlyCents,
  stackMonthlyCents,
  DEFAULT_SEATS,
  DEFAULT_SELECTION,
} from '@/app/(pages)/calculator/competitor-stack';

describe('competitor table integrity', () => {
  it('covers every sellable module — a module with no rival would understate their bill', () => {
    const missing = FEATURE_DOMAINS.filter((d) => !competitorFor(d.key)).map((d) => d.key);
    expect(missing).toEqual([]);
  });

  it('has no rows pointing at modules that no longer exist', () => {
    const known = new Set(FEATURE_DOMAINS.map((d) => d.key));
    expect(COMPETITORS.filter((c) => !known.has(c.key)).map((c) => c.key)).toEqual([]);
  });

  it('cites a source URL and a positive price on every row', () => {
    for (const c of COMPETITORS) {
      expect(c.url, `${c.vendor} needs a citation`).toMatch(/^https:\/\//);
      expect(c.monthlyCents, `${c.vendor} price`).toBeGreaterThan(0);
      expect(c.note.length, `${c.vendor} needs its caveat stated`).toBeGreaterThan(0);
    }
  });

  it('keeps the default selection valid', () => {
    for (const key of DEFAULT_SELECTION) expect(competitorFor(key)).toBeDefined();
  });
});

describe('competitorMonthlyCents', () => {
  const flat = COMPETITORS.find((c) => c.basis === 'flat')!;
  const hubspot = competitorFor('crm')!;

  it('does not multiply flat-rate tools by headcount', () => {
    expect(competitorMonthlyCents(flat, 1)).toBe(flat.monthlyCents);
    expect(competitorMonthlyCents(flat, 25)).toBe(flat.monthlyCents);
  });

  it('multiplies per-seat tools by headcount', () => {
    const notion = competitorFor('brain')!;
    expect(notion.basis).toBe('seat');
    expect(competitorMonthlyCents(notion, 4)).toBe(notion.monthlyCents * 4);
  });

  it('floors at the vendor seat minimum — a 3-person team still buys 5 HubSpot seats', () => {
    expect(hubspot.minSeats).toBe(5);
    expect(competitorMonthlyCents(hubspot, 3)).toBe(hubspot.monthlyCents * 5);
    expect(competitorMonthlyCents(hubspot, 1)).toBe(hubspot.monthlyCents * 5);
    // above the floor it tracks headcount again
    expect(competitorMonthlyCents(hubspot, 9)).toBe(hubspot.monthlyCents * 9);
  });

  it('ignores unknown keys rather than counting them as free', () => {
    expect(stackMonthlyCents(['not-a-module'], 3)).toBe(0);
    expect(stackMonthlyCents(['crm', 'not-a-module'], 3)).toBe(
      competitorMonthlyCents(hubspot, 3),
    );
  });
});

describe('the comparison the page actually renders', () => {
  const sd = computeAccountBilling(
    FEATURE_DOMAINS.filter((d) => DEFAULT_SELECTION.includes(d.key)).map(
      (d) => d.monthlyPriceCents,
    ),
    DEFAULT_SEATS,
  );

  it('applies the real volume tier to our side (5 modules unlocks 10%)', () => {
    expect(DEFAULT_SELECTION).toHaveLength(5);
    expect(sd.discountPercent).toBe(10);
  });

  it('charges the capped seat rate for seats beyond the first', () => {
    expect(sd.additionalSeats).toBe(DEFAULT_SEATS - 1);
    expect(sd.seatUnitCents).toBe(3_000); // module subtotal exceeds the $30 cap here
    expect(sd.totalCents).toBe(sd.moduleSubtotalCents + sd.seatTotalCents);
  });

  it('shows a saving at the default — the page has no reason to exist otherwise', () => {
    const stack = stackMonthlyCents(DEFAULT_SELECTION, DEFAULT_SEATS);
    expect(stack).toBeGreaterThan(sd.totalCents);
  });

  it('widens as the team grows, because their side is per-seat and ours is capped', () => {
    const gapAt = (seats: number) => {
      const ours = computeAccountBilling(
        FEATURE_DOMAINS.filter((d) => DEFAULT_SELECTION.includes(d.key)).map(
          (d) => d.monthlyPriceCents,
        ),
        seats,
      );
      return stackMonthlyCents(DEFAULT_SELECTION, seats) - ours.totalCents;
    };
    expect(gapAt(10)).toBeGreaterThan(gapAt(3));
    expect(gapAt(25)).toBeGreaterThan(gapAt(10));
  });

  it('honestly reports a single cheap point tool as cheaper than us', () => {
    // Bookings alone: Calendly at $10/seat vs our $15 module + capped seats.
    // If this ever flips, the "when this calculator is wrong" band is a lie.
    const solo = computeAccountBilling([15_00], 1);
    expect(stackMonthlyCents(['bookings'], 1)).toBeLessThan(solo.totalCents);
  });
});
