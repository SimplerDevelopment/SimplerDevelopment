import { describe, it, expect } from 'vitest';
import { brandingToCssVars } from '@/lib/branding/css-vars';
import { brandingTypographyCss } from '@/lib/branding/typography-css';
import type { ResolvedBranding } from '@/lib/branding-types';

function makeBranding(typography?: ResolvedBranding['typography']): ResolvedBranding {
  return {
    primaryColor: '#111',
    secondaryColor: '#222',
    accentColor: '#333',
    backgroundColor: '#fff',
    textColor: '#000',
    navBackground: '#eee',
    navTextColor: '#111',
    logoUrl: '', logoSquareUrl: '', logoRectUrl: '', logoIconUrl: '',
    logoText: '', logoAlt: '',
    navTemplate: 'default', navPosition: 'top',
    headingFont: '', bodyFont: '',
    typography,
  } as ResolvedBranding;
}

describe('brandingToCssVars — per-element typography', () => {
  it('emits no typography vars when typography is undefined', () => {
    const vars = brandingToCssVars(makeBranding());
    expect(Object.keys(vars).some((k) => k.match(/^--brand-h\d-/))).toBe(false);
  });

  it('emits size/weight/line-height/letter-spacing/font for configured h1', () => {
    const vars = brandingToCssVars(makeBranding({
      h1: { size: '3rem', weight: '700', lineHeight: '1.1', letterSpacing: '-0.02em', font: 'Playfair' },
    }));
    expect(vars['--brand-h1-size']).toBe('3rem');
    expect(vars['--brand-h1-weight']).toBe('700');
    expect(vars['--brand-h1-line-height']).toBe('1.1');
    expect(vars['--brand-h1-letter-spacing']).toBe('-0.02em');
    expect(vars['--brand-h1-font']).toBe('Playfair');
  });

  it('only emits the fields that are set', () => {
    const vars = brandingToCssVars(makeBranding({
      p: { size: '1rem' },
    }));
    expect(vars['--brand-p-size']).toBe('1rem');
    expect(vars['--brand-p-weight']).toBeUndefined();
    expect(vars['--brand-p-font']).toBeUndefined();
  });

  it('handles multiple elements independently', () => {
    const vars = brandingToCssVars(makeBranding({
      h1: { size: '3rem' },
      button: { weight: '500' },
      small: { size: '0.75rem' },
    }));
    expect(vars['--brand-h1-size']).toBe('3rem');
    expect(vars['--brand-button-weight']).toBe('500');
    expect(vars['--brand-small-size']).toBe('0.75rem');
  });
});

describe('brandingTypographyCss', () => {
  it('returns empty string when typography is undefined', () => {
    expect(brandingTypographyCss(makeBranding())).toBe('');
  });

  it('emits a scoped rule for configured h1', () => {
    const css = brandingTypographyCss(makeBranding({
      h1: { size: '3rem', weight: '700' },
    }));
    expect(css).toContain('.brand-scope h1');
    expect(css).toContain('font-size: 3rem');
    expect(css).toContain('font-weight: 700');
  });

  it('does not emit rules for un-configured elements', () => {
    const css = brandingTypographyCss(makeBranding({
      h1: { size: '3rem' },
    }));
    expect(css).not.toContain('h2');
    expect(css).not.toContain('p {');
  });

  it('skips elements that have an empty object', () => {
    const css = brandingTypographyCss(makeBranding({
      h1: {},
      h2: { size: '2rem' },
    }));
    expect(css).not.toMatch(/brand-scope h1 \{/);
    expect(css).toContain('.brand-scope h2');
  });

  it('emits button under multiple selectors', () => {
    const css = brandingTypographyCss(makeBranding({
      button: { weight: '500' },
    }));
    expect(css).toContain('.brand-scope button');
    expect(css).toContain('.brand-scope .btn');
  });

  it('wraps font family in quotes', () => {
    const css = brandingTypographyCss(makeBranding({
      h1: { font: 'Playfair Display' },
    }));
    expect(css).toContain('font-family: "Playfair Display", sans-serif');
  });

  it('respects custom scope class', () => {
    const css = brandingTypographyCss(makeBranding({
      h1: { size: '3rem' },
    }), 'my-scope');
    expect(css).toContain('.my-scope h1');
    expect(css).not.toContain('.brand-scope h1');
  });
});
