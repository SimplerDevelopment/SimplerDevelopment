// @vitest-environment node
/**
 * Unit tests for Printful variant matching.
 *
 * This is a money path by proxy: the id chosen here decides which physical
 * garment Printful prints. A wrong match ships the wrong colour to a customer,
 * so the tests care as much about REFUSING to match as about matching.
 *
 * Colour names below are taken verbatim from the real catalog import (the
 * Gildan Softstyle tee's 62 colourways), which is where the abbreviations come
 * from.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeColor,
  normalizeSize,
  variantColorSize,
  matchVariants,
} from '@/lib/fulfillment/matchPrintfulVariants';

describe('normalizeColor', () => {
  it('expands the abbreviations the catalog import actually produces', () => {
    expect(normalizeColor('Hthr Irish Grn')).toBe(normalizeColor('Heather Irish Green'));
    expect(normalizeColor('Antqu Chry Red')).toBe(normalizeColor('Antique Cherry Red'));
    expect(normalizeColor('Hthr Mltry Grn')).toBe(normalizeColor('Heather Military Green'));
    expect(normalizeColor('Antqu Sapphire')).toBe(normalizeColor('Antique Sapphire'));
  });

  it('splits run-together names so the abbreviations are visible', () => {
    expect(normalizeColor('IceGrey')).toBe(normalizeColor('Ice Gray'));
    expect(normalizeColor('TrplBlue')).toBe(normalizeColor('Triple Blue'));
    expect(normalizeColor('KellyGreen')).toBe(normalizeColor('Kelly Green'));
  });

  it('ignores case, spacing and punctuation', () => {
    expect(normalizeColor('  dark   HEATHER ')).toBe(normalizeColor('Dark Heather'));
    expect(normalizeColor('Cherry-Red')).toBe(normalizeColor('Cherry Red'));
  });

  it('treats grey and gray as the same colour', () => {
    expect(normalizeColor('Sports Grey')).toBe(normalizeColor('Sports Gray'));
  });

  it('does NOT collapse genuinely different colours', () => {
    expect(normalizeColor('Navy')).not.toBe(normalizeColor('Heather Navy'));
    expect(normalizeColor('Red')).not.toBe(normalizeColor('Cardinal'));
    expect(normalizeColor('Irish Green')).not.toBe(normalizeColor('Heather Irish Green'));
  });

  it('is empty for missing input', () => {
    expect(normalizeColor(null)).toBe('');
    expect(normalizeColor(undefined)).toBe('');
  });
});

describe('normalizeSize', () => {
  it('reconciles the two ways catalogs write big sizes', () => {
    expect(normalizeSize('2XL')).toBe(normalizeSize('XXL'));
    expect(normalizeSize('3XL')).toBe(normalizeSize('XXXL'));
    expect(normalizeSize('2X')).toBe(normalizeSize('2XL'));
  });

  it('keeps distinct sizes distinct', () => {
    expect(normalizeSize('XL')).not.toBe(normalizeSize('2XL'));
    expect(normalizeSize('S')).not.toBe(normalizeSize('XS'));
  });

  it('ignores case and spacing', () => {
    expect(normalizeSize(' xl ')).toBe(normalizeSize('XL'));
  });
});

describe('variantColorSize', () => {
  it('splits the "Size / Color" name opt-in generates', () => {
    expect(variantColorSize({ id: 1, name: 'S / Indigo Blue' })).toEqual({ size: 'S', color: 'Indigo Blue' });
  });

  it('prefers explicit fields over the name', () => {
    expect(variantColorSize({ id: 1, name: 'S / Wrong', color: 'Navy', size: 'L' }))
      .toEqual({ color: 'Navy', size: 'L' });
  });

  it('returns empties when it cannot tell', () => {
    expect(variantColorSize({ id: 1, name: 'Default' })).toEqual({ color: '', size: '' });
  });
});

describe('matchVariants', () => {
  const printful = [
    { id: 4012, color: 'Heather Irish Green', size: 'S' },
    { id: 4013, color: 'Antique Cherry Red', size: 'XL' },
    { id: 4014, color: 'Ice Gray', size: '2XL' },
    { id: 4015, color: 'Navy', size: 'M' },
  ];

  it('matches across abbreviation and size-notation differences', () => {
    const ours = [
      { id: 1, name: 'S / Hthr Irish Grn' },
      { id: 2, name: 'XL / Antqu Chry Red' },
      { id: 3, name: 'XXL / IceGrey' },
    ];
    const res = matchVariants(ours, printful);

    expect(res.unmatched).toEqual([]);
    expect(res.matched.map((m) => m.printfulVariantId)).toEqual([4012, 4013, 4014]);
  });

  it('reports a variant with no counterpart instead of guessing', () => {
    const res = matchVariants([{ id: 9, name: '5XL / Daisy' }], printful);
    expect(res.matched).toEqual([]);
    expect(res.unmatched[0].reason).toMatch(/no Printful variant/i);
  });

  it('refuses BOTH when two Printful variants normalise alike', () => {
    // Never pick arbitrarily — the wrong id prints the wrong garment.
    const ambiguous = [
      { id: 1, color: 'Sports Grey', size: 'L' },
      { id: 2, color: 'Sports Gray', size: 'L' },
    ];
    const res = matchVariants([{ id: 5, name: 'L / Sports Grey' }], ambiguous);
    expect(res.matched).toEqual([]);
    expect(res.unmatched[0].reason).toMatch(/ambiguous/i);
  });

  it('reports variants that carry no colour or size', () => {
    const res = matchVariants([{ id: 7, name: 'Default' }], printful);
    expect(res.matched).toEqual([]);
    expect(res.unmatched[0].reason).toMatch(/no colour\/size/i);
  });

  it('does not cross-match a heather onto its plain counterpart', () => {
    // The failure that would be easy to ship: "Irish Green" silently matching
    // "Heather Irish Green" and printing the wrong garment.
    const res = matchVariants([{ id: 8, name: 'S / Irish Green' }], printful);
    expect(res.matched).toEqual([]);
    expect(res.unmatched[0].reason).toMatch(/no Printful variant/i);
  });

  it('handles a realistic batch, matching what it can and reporting the rest', () => {
    const ours = [
      { id: 1, name: 'S / Hthr Irish Grn' },
      { id: 2, name: 'M / Navy' },
      { id: 3, name: '4XL / Azalea' },
    ];
    const res = matchVariants(ours, printful);
    expect(res.matched).toHaveLength(2);
    expect(res.unmatched).toHaveLength(1);
    expect(res.unmatched[0].variantId).toBe(3);
  });
});
